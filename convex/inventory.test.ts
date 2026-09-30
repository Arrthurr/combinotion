/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import {
  appendInventoryMovement,
  consumeReservation,
  releaseReservation,
  reserveTitle,
  restoreReservation,
  reverseInventoryMovement,
} from "./inventory";
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

  it("reverses a source once and ignores missing sources", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 10,
      reason: "Initial count",
    });
    await t.run(async (ctx) => {
      await appendInventoryMovement(ctx, {
        titleId,
        kind: "donation",
        quantity: 4,
        sourceId: "donation:visit-1:title-1:1",
      });
      await reverseInventoryMovement(
        ctx,
        "donation:visit-1:title-1:1",
      );
      await reverseInventoryMovement(
        ctx,
        "donation:visit-1:title-1:1",
      );
      await reverseInventoryMovement(ctx, "missing");
    });

    const review = await asStaff.query(api.inventory.listReview, {});
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(review[0].quantityOnHand).toBe(10);
    expect(
      history.filter(
        (movement) =>
          movement.sourceId ===
          "reverse:donation:visit-1:title-1:1",
      ),
    ).toHaveLength(1);
  });
});

describe("inventory reservation stock", () => {
  async function seedTitleAndRequest(
    t: Awaited<ReturnType<typeof createStaffTest>>["t"],
    asStaff: Awaited<ReturnType<typeof createStaffTest>>["asStaff"],
    quantityOnHand: number,
  ) {
    const titleId = await createTitle(asStaff);
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: quantityOnHand,
      reason: "Physical count",
    });
    const schoolRequestId = await t.run(async (ctx) =>
      ctx.db.insert("schoolRequests", {
        schoolName: "Joy School",
        schoolAddress: "1 Main Street",
        contactName: "Pat",
        email: "pat@example.com",
        status: "active",
        matchStatus: "unmatched",
        reference: "JFB-TEST",
        createdAt: Date.now(),
      }),
    );
    return { titleId, schoolRequestId };
  }

  it("reserves without depleting on-hand and refuses when copies are not available", async () => {
    const { t, asStaff } = await createStaffTest();
    const { titleId, schoolRequestId } = await seedTitleAndRequest(
      t,
      asStaff,
      10,
    );

    const reservationId = await t.run(async (ctx) =>
      reserveTitle(ctx, {
        titleId,
        schoolRequestId,
        quantity: 6,
        sourceId: `reservation:${schoolRequestId}:${titleId}`,
      }),
    );
    const again = await t.run(async (ctx) =>
      reserveTitle(ctx, {
        titleId,
        schoolRequestId,
        quantity: 6,
        sourceId: `reservation:${schoolRequestId}:${titleId}`,
      }),
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(again).toBe(reservationId);
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 6,
      }),
    );
    expect(reservations).toEqual([
      expect.objectContaining({
        _id: reservationId,
        quantity: 6,
        active: true,
      }),
    ]);

    await expect(
      t.run(async (ctx) =>
        reserveTitle(ctx, {
          titleId,
          schoolRequestId,
          quantity: 5,
          sourceId: `reservation:other:${titleId}`,
        }),
      ),
    ).rejects.toThrow("Those copies are no longer available");
  });

  it("releases remaining quantity once and no-ops an inactive reservation", async () => {
    const { t, asStaff } = await createStaffTest();
    const { titleId, schoolRequestId } = await seedTitleAndRequest(
      t,
      asStaff,
      10,
    );
    const reservationId = await t.run(async (ctx) =>
      reserveTitle(ctx, {
        titleId,
        schoolRequestId,
        quantity: 6,
        sourceId: `reservation:${schoolRequestId}:${titleId}`,
      }),
    );
    const sourceId = `release:${schoolRequestId}:${titleId}`;

    await t.run(async (ctx) =>
      releaseReservation(ctx, { reservationId, sourceId }),
    );
    await t.run(async (ctx) =>
      releaseReservation(ctx, { reservationId, sourceId }),
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservation = await t.run(async (ctx) =>
      ctx.db.get(reservationId),
    );
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(title?.activeReservedQuantity).toBe(0);
    expect(reservation).toEqual(
      expect.objectContaining({ quantity: 6, active: false }),
    );
    expect(
      history.filter((movement) => movement.kind === "release"),
    ).toHaveLength(1);
  });

  it("consumes part of a reservation and restores it during shortage", async () => {
    const { t, asStaff } = await createStaffTest();
    const { titleId, schoolRequestId } = await seedTitleAndRequest(
      t,
      asStaff,
      10,
    );
    const reservationId = await t.run(async (ctx) =>
      reserveTitle(ctx, {
        titleId,
        schoolRequestId,
        quantity: 6,
        sourceId: `reservation:${schoolRequestId}:${titleId}`,
      }),
    );

    const consumeSource = `reservationConsumption:${reservationId}`;
    await t.run(async (ctx) =>
      consumeReservation(ctx, {
        reservationId,
        quantity: 4,
        sourceId: consumeSource,
      }),
    );
    await t.run(async (ctx) =>
      consumeReservation(ctx, {
        reservationId,
        quantity: 4,
        sourceId: consumeSource,
      }),
    );
    await t.run(async (ctx) =>
      appendInventoryMovement(ctx, {
        titleId,
        kind: "donation",
        quantity: 8,
        sourceId: "donation:visit:title:1",
      }),
    );

    let title = await t.run(async (ctx) => ctx.db.get(titleId));
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 2,
        activeReservedQuantity: 2,
      }),
    );

    const restoreSource = `reverse:reservationConsumption:${reservationId}`;
    await t.run(async (ctx) =>
      restoreReservation(ctx, {
        reservationId,
        quantity: 4,
        sourceId: restoreSource,
      }),
    );
    await t.run(async (ctx) =>
      restoreReservation(ctx, {
        reservationId,
        quantity: 4,
        sourceId: restoreSource,
      }),
    );

    title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservation = await t.run(async (ctx) =>
      ctx.db.get(reservationId),
    );
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 2,
        activeReservedQuantity: 6,
      }),
    );
    expect(reservation).toEqual(
      expect.objectContaining({ quantity: 6, active: true }),
    );
  });

  it("no-ops a repeated consume after the reservation is fully consumed", async () => {
    const { t, asStaff } = await createStaffTest();
    const { titleId, schoolRequestId } = await seedTitleAndRequest(
      t,
      asStaff,
      10,
    );
    const reservationId = await t.run(async (ctx) =>
      reserveTitle(ctx, {
        titleId,
        schoolRequestId,
        quantity: 4,
        sourceId: `reservation:${schoolRequestId}:${titleId}`,
      }),
    );
    const sourceId = `reservationConsumption:${reservationId}`;
    await t.run(async (ctx) =>
      consumeReservation(ctx, {
        reservationId,
        quantity: 4,
        sourceId,
      }),
    );
    await t.run(async (ctx) =>
      consumeReservation(ctx, {
        reservationId,
        quantity: 4,
        sourceId,
      }),
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservation = await t.run(async (ctx) =>
      ctx.db.get(reservationId),
    );
    expect(title?.activeReservedQuantity).toBe(0);
    expect(reservation).toEqual(
      expect.objectContaining({ quantity: 0, active: false }),
    );
  });

  it("refuses reservation kinds on append and reverse, and consume on inactive", async () => {
    const { t, asStaff } = await createStaffTest();
    const { titleId, schoolRequestId } = await seedTitleAndRequest(
      t,
      asStaff,
      10,
    );
    const reservationId = await t.run(async (ctx) =>
      reserveTitle(ctx, {
        titleId,
        schoolRequestId,
        quantity: 3,
        sourceId: `reservation:${schoolRequestId}:${titleId}`,
      }),
    );

    await expect(
      t.run(async (ctx) =>
        appendInventoryMovement(ctx, {
          titleId,
          kind: "reservation" as never,
          quantity: 1,
          sourceId: "reservation:bypass",
        }),
      ),
    ).rejects.toThrow("Reservation stock changes");

    await t.run(async (ctx) =>
      releaseReservation(ctx, {
        reservationId,
        sourceId: `release:${schoolRequestId}:${titleId}`,
      }),
    );

    await expect(
      t.run(async (ctx) =>
        consumeReservation(ctx, {
          reservationId,
          quantity: 1,
          sourceId: "reservationConsumption:inactive",
        }),
      ),
    ).rejects.toThrow("inactive");

    await expect(
      t.run(async (ctx) =>
        reverseInventoryMovement(
          ctx,
          `reservation:${schoolRequestId}:${titleId}`,
        ),
      ),
    ).rejects.toThrow("Reservation stock changes");

    await expect(
      t.run(async (ctx) =>
        appendInventoryMovement(ctx, {
          titleId,
          kind: "release" as never,
          quantity: 1,
          sourceId: "release:bypass",
        }),
      ),
    ).rejects.toThrow("Reservation stock changes");
    await expect(
      t.run(async (ctx) =>
        appendInventoryMovement(ctx, {
          titleId,
          kind: "reservationConsumption" as never,
          quantity: 1,
          sourceId: "reservationConsumption:bypass",
        }),
      ),
    ).rejects.toThrow("Reservation stock changes");
  });
});
