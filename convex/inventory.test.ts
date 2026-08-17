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
  return {
    t,
    asStaff: t.withIdentity({ subject: "staff_1" }),
  };
}

async function createTitle(
  asStaff: Awaited<ReturnType<typeof createStaffTest>>["asStaff"],
  isbn = "1",
) {
  return await asStaff.mutation(api.titles.createTitle, {
    title: `Book ${isbn}`,
    author: "Ann",
    isbn,
  });
}

describe("staff inventory", () => {
  it("rejects anonymous and non-staff callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.inventory.listReview, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .query(api.inventory.listReview, {}),
    ).rejects.toThrow("Staff membership required");
  });

  it("records an opening balance and flags low stock for reorder", async () => {
    const { asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 14,
      reason: "Physical count",
    });

    let review = await asStaff.query(api.inventory.listReview, {});
    expect(review[0]).toEqual(
      expect.objectContaining({
        quantityOnHand: 14,
        lowStock: true,
        reorderNeeded: false,
      }),
    );

    await asStaff.mutation(api.inventory.markReorderNeeded, {
      titleId,
      needed: true,
    });
    review = await asStaff.query(api.inventory.listReview, {});
    expect(review[0].reorderNeeded).toBe(true);
  });

  it("records a reasoned correction from 25 to 23 in history", async () => {
    const { asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 25,
      reason: "Initial count",
    });
    await asStaff.mutation(api.inventory.correctOnHand, {
      titleId,
      quantityOnHand: 23,
      reason: "Shelf recount",
    });

    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(history[0]).toEqual(
      expect.objectContaining({
        kind: "adjustment",
        quantity: -2,
        reason: "Shelf recount",
      }),
    );
    const review = await asStaff.query(api.inventory.listReview, {});
    expect(review[0].quantityOnHand).toBe(23);
  });

  it("rejects a correction without a reason", async () => {
    const { asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await expect(
      asStaff.mutation(api.inventory.correctOnHand, {
        titleId,
        quantityOnHand: 2,
        reason: " ",
      }),
    ).rejects.toThrow("Reason is required");
  });

  it("keeps a truthful correction that creates a shortage", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 10,
      reason: "Initial count",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(titleId, { activeReservedQuantity: 6 });
    });

    await asStaff.mutation(api.inventory.correctOnHand, {
      titleId,
      quantityOnHand: 4,
      reason: "Damaged copies removed",
    });

    const review = await asStaff.query(api.inventory.listReview, {});
    expect(review[0]).toEqual(
      expect.objectContaining({
        quantityOnHand: 4,
        activeReservedQuantity: 6,
        availableQuantity: 0,
        shortage: true,
      }),
    );
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(history[0]).toEqual(
      expect.objectContaining({
        kind: "adjustment",
        quantity: -6,
        reason: "Damaged copies removed",
      }),
    );
  });

  it("does not stack an opening balance on a correction", async () => {
    const { asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.correctOnHand, {
      titleId,
      quantityOnHand: 8,
      reason: "Shelf count",
    });
    await expect(
      asStaff.mutation(api.inventory.recordOpeningBalance, {
        titleId,
        quantity: 8,
        reason: "Initial count",
      }),
    ).rejects.toThrow("no movements");

    const review = await asStaff.query(api.inventory.listReview, {});
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(review[0].quantityOnHand).toBe(8);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(
      expect.objectContaining({
        kind: "adjustment",
        quantity: 8,
        reason: "Shelf count",
      }),
    );
  });

  it("rejects an opening balance when movements net to zero on-hand", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await t.run(async (ctx) => {
      await ctx.db.insert("inventoryMovements", {
        titleId,
        kind: "receipt",
        quantity: 5,
        sourceId: `receipt:${titleId}:seed`,
        createdAt: Date.now(),
      });
      await ctx.db.insert("inventoryMovements", {
        titleId,
        kind: "donation",
        quantity: 5,
        sourceId: `donation:${titleId}:seed`,
        createdAt: Date.now(),
      });
    });

    await expect(
      asStaff.mutation(api.inventory.recordOpeningBalance, {
        titleId,
        quantity: 5,
        reason: "Initial count",
      }),
    ).rejects.toThrow("no movements");

    const review = await asStaff.query(api.inventory.listReview, {});
    expect(review[0].quantityOnHand).toBe(0);
  });

  it("does not duplicate an opening balance", async () => {
    const { asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 5,
      reason: "Initial count",
    });
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 9,
      reason: "Repeated import",
    });

    const review = await asStaff.query(api.inventory.listReview, {});
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(review[0].quantityOnHand).toBe(5);
    expect(history).toHaveLength(1);
  });
});
