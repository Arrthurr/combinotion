/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function createStaffTest() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff_1",
    email: "coo@example.com",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("orgSettings", {
      key: "org",
      lowStockThreshold: 15,
      publicRequests: { kind: "open" },
    });
  });
  return {
    t,
    asStaff: t.withIdentity({ subject: "staff_1" }),
  };
}

async function insertTitle(
  t: Awaited<ReturnType<typeof createStaffTest>>["t"],
  {
    isbn = "1",
    quantityOnHand = 10,
    notes,
  }: {
    isbn?: string;
    quantityOnHand?: number;
    notes?: string;
  } = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("titles", {
      title: `Book ${isbn}`,
      author: "Ann",
      isbn,
      quantityOnHand,
      activeReservedQuantity: 0,
      reorderNeeded: false,
      ...(notes === undefined ? {} : { notes }),
    }),
  );
}

function requestArgs({
  isbn = "1",
  quantity = 1,
  schoolName = "Joy School",
  address = "1 Main Street",
  idempotencyKey,
}: {
  isbn?: string;
  quantity?: number;
  schoolName?: string;
  address?: string;
  idempotencyKey?: string;
} = {}) {
  return {
    schoolName,
    address,
    contactName: "Pat Reader",
    email: "pat@example.com",
    lines: [{ isbn, quantity }],
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  };
}

describe("school requests", () => {
  it("keeps the public list empty and rejects submit while requests are paused", async () => {
    const t = convexTest(schema, modules);
    await insertTitle(t);
    expect(await t.query(api.titles.listRequestable, {})).toEqual([]);
    await expect(
      t.mutation(internal.schoolRequests.internalSubmit, requestArgs()),
    ).rejects.toThrow("Public book requests are closed");
  });

  it("reserves copies and restores availability when declined", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await insertTitle(t, { notes: "Private note" });
    const result = await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({ quantity: 6 }),
    );
    expect(result.reference).toMatch(/^JFB-[A-Z0-9]{8}$/);

    let title = await t.run(async (ctx) => ctx.db.get(titleId));
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 6,
      }),
    );
    expect(await t.query(api.titles.listRequestable, {})).toEqual([
      {
        title: "Book 1",
        author: "Ann",
        isbn: "1",
        availableQuantity: 4,
      },
    ]);

    const active = await asStaff.query(
      api.schoolRequests.listActive,
      {},
    );
    await asStaff.mutation(api.schoolRequests.resolveRequest, {
      requestId: active[0]._id,
      resolution: "declined",
    });

    title = await t.run(async (ctx) => ctx.db.get(titleId));
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 0,
      }),
    );
    expect(await t.query(api.titles.listRequestable, {})).toEqual([
      {
        title: "Book 1",
        author: "Ann",
        isbn: "1",
        availableQuantity: 10,
      },
    ]);
  });

  it("accepts the remaining four copies and rejects over-reservation", async () => {
    const { t } = await createStaffTest();
    const titleId = await insertTitle(t);
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({ quantity: 6 }),
    );
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({
        quantity: 4,
        schoolName: "Second School",
        address: "2 Main Street",
      }),
    );
    await expect(
      t.mutation(
        internal.schoolRequests.internalSubmit,
        requestArgs({
          quantity: 1,
          schoolName: "Third School",
          address: "3 Main Street",
        }),
      ),
    ).rejects.toThrow("no longer available");

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 10,
      }),
    );
  });

  it("attaches an exact normalized school match", async () => {
    const { t, asStaff } = await createStaffTest();
    await insertTitle(t);
    const schoolId = await t.run(async (ctx) =>
      ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      }),
    );
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({
        schoolName: "  JOY   SCHOOL ",
        address: " 1 MAIN STREET ",
      }),
    );

    const active = await asStaff.query(
      api.schoolRequests.listActive,
      {},
    );
    expect(active[0]).toEqual(
      expect.objectContaining({
        schoolId,
        matchStatus: "attached",
      }),
    );
  });

  it("lists a name-only match as an ambiguous exception", async () => {
    const { t, asStaff } = await createStaffTest();
    await insertTitle(t);
    await t.run(async (ctx) =>
      ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      }),
    );
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({ address: "99 Other Street" }),
    );

    const exceptions = await asStaff.query(
      api.schoolRequests.listExceptions,
      {},
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].matchStatus).toBe("ambiguous");
  });

  it("lists an attached request when its reservation is in shortage", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await insertTitle(t);
    await t.run(async (ctx) =>
      ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      }),
    );
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({ quantity: 6 }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(titleId, { quantityOnHand: 4 });
    });

    const exceptions = await asStaff.query(
      api.schoolRequests.listExceptions,
      {},
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toEqual(
      expect.objectContaining({
        matchStatus: "attached",
        hasShortage: true,
      }),
    );
    expect(exceptions[0].lines[0].shortage).toBe(true);
  });

  it("cancels a request and releases its reservations", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await insertTitle(t);
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs({ quantity: 3 }),
    );
    const active = await asStaff.query(
      api.schoolRequests.listActive,
      {},
    );
    await asStaff.mutation(api.schoolRequests.resolveRequest, {
      requestId: active[0]._id,
      resolution: "cancelled",
    });
    await asStaff.mutation(api.schoolRequests.resolveRequest, {
      requestId: active[0]._id,
      resolution: "cancelled",
    });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(title?.activeReservedQuantity).toBe(0);
    expect(reservations[0].active).toBe(false);
  });

  it("does not double-reserve a repeated idempotency key", async () => {
    const { t } = await createStaffTest();
    const titleId = await insertTitle(t);
    const args = requestArgs({
      quantity: 2,
      idempotencyKey: "request-key",
    });
    const first = await t.mutation(
      internal.schoolRequests.internalSubmit,
      args,
    );
    const second = await t.mutation(
      internal.schoolRequests.internalSubmit,
      args,
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(second).toEqual(first);
    expect(title?.activeReservedQuantity).toBe(2);
    expect(reservations).toHaveLength(1);
  });

  it("keeps submission internal and protects staff operations", async () => {
    const t = convexTest(schema, modules);
    expect("internalSubmit" in api.schoolRequests).toBe(false);
    await t.run(async (ctx) => {
      await ctx.db.insert("orgSettings", {
        key: "org",
        lowStockThreshold: 15,
        publicRequests: { kind: "open" },
      });
    });
    await insertTitle(t);
    await t.mutation(
      internal.schoolRequests.internalSubmit,
      requestArgs(),
    );
    const requests = await t.run(async (ctx) =>
      ctx.db.query("schoolRequests").collect(),
    );
    await expect(
      t.query(api.schoolRequests.listActive, {}),
    ).rejects.toThrow("Authentication required");
    await expect(
      t.mutation(api.schoolRequests.resolveRequest, {
        requestId: requests[0]._id,
        resolution: "declined",
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .query(api.schoolRequests.listExceptions, {}),
    ).rejects.toThrow("Staff membership required");
  });

  it("rejects direct HTTP submission without the shared secret", async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch("/school-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestArgs()),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Request service unavailable",
    });
  });

  it("keeps the anonymous title projection minimal", async () => {
    const { t } = await createStaffTest();
    await insertTitle(t, { notes: "Private note" });
    const requestable = await t.query(
      api.titles.listRequestable,
      {},
    );
    expect(requestable).toEqual([
      {
        title: "Book 1",
        author: "Ann",
        isbn: "1",
        availableQuantity: 10,
      },
    ]);
    expect(requestable[0]).not.toHaveProperty("quantityOnHand");
    expect(requestable[0]).not.toHaveProperty("notes");
  });
});
