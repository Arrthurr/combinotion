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

describe("staff views", () => {
  it("gates view queries, mutations, and ISBN actions", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.views.getTableColumns, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .query(api.views.listVisitBoard, {}),
    ).rejects.toThrow("Staff membership required");
    await expect(
      t.action(api.integrations.openLibrary.lookupIsbn, {
        isbn: "9780000000001",
      }),
    ).rejects.toThrow("Authentication required");
  });

  it("stores sanitized table columns per staff member", async () => {
    const { t, asStaff } = await createStaffTest();
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_2",
      email: "ops@example.com",
    });
    const asOtherStaff = t.withIdentity({ subject: "staff_2" });

    await expect(
      asStaff.query(api.views.getTableColumns, {}),
    ).resolves.toEqual([
      "author",
      "isbn",
      "quantityOnHand",
      "availableQuantity",
      "reorderNeeded",
    ]);
    await asStaff.mutation(api.views.setTableColumns, {
      columns: ["isbn", "notes", "isbn"],
    });
    await expect(
      asStaff.query(api.views.getTableColumns, {}),
    ).resolves.toEqual(["isbn", "notes"]);
    await expect(
      asOtherStaff.query(api.views.getTableColumns, {}),
    ).resolves.toEqual([
      "author",
      "isbn",
      "quantityOnHand",
      "availableQuantity",
      "reorderNeeded",
    ]);

    await t.run(async (ctx) => {
      const config = await ctx.db
        .query("viewConfigs")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", "staff_1"))
        .unique();
      if (!config) {
        throw new Error("Expected a table configuration");
      }
      await ctx.db.patch(config._id, {
        tableColumns: ["retiredColumn", "notes", "notes"],
      });
    });
    await expect(
      asStaff.query(api.views.getTableColumns, {}),
    ).resolves.toEqual(["notes"]);
  });

  it("moves and resolves visit plans without applying visit effects", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await asStaff.mutation(api.schools.createSchool, {
      name: "Joy School",
      address: "1 Main Street",
    });
    const otherSchoolId = await asStaff.mutation(api.schools.createSchool, {
      name: "Other School",
      address: "2 Main Street",
    });
    const titleId = await asStaff.mutation(api.titles.createTitle, {
      title: "A Good Book",
      author: "Ann Author",
      isbn: "9780000000001",
    });
    const planId = await asStaff.mutation(api.views.saveVisitPlan, {
      schoolId,
      stage: "readerConfirmation",
      plannedFor: 20,
      notes: " Confirm the reader. ",
    });
    const { visitId, otherVisitId } = await t.run(async (ctx) => {
      const visitId = await ctx.db.insert("visits", {
        schoolId,
        occurredAt: 30,
        followUp: "Send a reading list.",
        effectGeneration: 1,
      });
      await ctx.db.insert("visitBooks", {
        visitId,
        titleId,
        donatedQuantity: 3,
        readAloud: true,
        consumptionStatus: "none",
        consumedQuantity: 0,
      });
      const otherVisitId = await ctx.db.insert("visits", {
        schoolId: otherSchoolId,
        occurredAt: 25,
        effectGeneration: 1,
      });
      return { visitId, otherVisitId };
    });

    await expect(
      asStaff.query(api.views.listVisitBoard, {}),
    ).resolves.toEqual({
      columns: {
        readerConfirmation: [
          expect.objectContaining({
            planId,
            schoolName: "Joy School",
            notes: "Confirm the reader.",
          }),
        ],
        schoolContact: [],
        securingBooks: [],
      },
      recentlyVisited: [],
    });
    await asStaff.mutation(api.views.setVisitPlanStage, {
      planId,
      stage: "schoolContact",
    });
    await expect(
      asStaff.mutation(api.views.resolveVisitPlan, {
        planId,
        resolution: { kind: "visited", visitId: otherVisitId },
      }),
    ).rejects.toThrow("planned school");
    await asStaff.mutation(api.views.resolveVisitPlan, {
      planId,
      resolution: { kind: "visited", visitId },
    });
    await asStaff.mutation(api.views.resolveVisitPlan, {
      planId,
      resolution: { kind: "visited", visitId },
    });
    await expect(
      asStaff.mutation(api.views.resolveVisitPlan, {
        planId,
        resolution: { kind: "archived" },
      }),
    ).rejects.toThrow("different resolution");

    const resolved = await asStaff.query(api.views.listVisitBoard, {});
    expect(resolved.columns).toEqual({
      readerConfirmation: [],
      schoolContact: [],
      securingBooks: [],
    });
    expect(resolved.recentlyVisited).toEqual([
      expect.objectContaining({
        planId,
        visitId,
        schoolName: "Joy School",
        donatedQuantity: 3,
      }),
    ]);

    await t.run(async (ctx) => ctx.db.delete(visitId));
    await expect(
      asStaff.query(api.views.listVisitBoard, {}),
    ).resolves.toEqual({
      columns: {
        readerConfirmation: [],
        schoolContact: [],
        securingBooks: [],
      },
      recentlyVisited: [],
    });
  });

  it("returns a bounded, joined operations timeline", async () => {
    const { t, asStaff } = await createStaffTest();
    const values = await t.run(async (ctx) => {
      const supplierId = await ctx.db.insert("suppliers", {
        name: "Book Distributor",
      });
      const titleId = await ctx.db.insert("titles", {
        title: "A Good Book",
        author: "Ann Author",
        isbn: "9780000000001",
        quantityOnHand: 5,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      });
      const schoolId = await ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      });
      const orderId = await ctx.db.insert("orders", {
        supplierId,
        status: "ordered",
        orderedAt: 20,
        expectedAt: 50,
      });
      await ctx.db.insert("orderLines", {
        orderId,
        titleId,
        orderedQuantity: 5,
        receivedQuantity: 2,
      });
      await ctx.db.insert("inventoryMovements", {
        titleId,
        kind: "receipt",
        quantity: 2,
        sourceId: "receipt:test",
        createdAt: 30,
      });
      const visitId = await ctx.db.insert("visits", {
        schoolId,
        occurredAt: 40,
        effectGeneration: 1,
      });
      await ctx.db.insert("visitBooks", {
        visitId,
        titleId,
        donatedQuantity: 1,
        readAloud: true,
        consumptionStatus: "none",
        consumedQuantity: 0,
      });
      return { orderId };
    });

    const timeline = await asStaff.query(api.views.listTimeline, {
      window: { from: 10, to: 50 },
    });
    expect(timeline.truncated).toBe(false);
    expect(timeline.events.map((event) => event.kind)).toEqual([
      "expectedDelivery",
      "visitOccurred",
      "movement",
      "orderPlaced",
    ]);
    expect(timeline.events[0]).toEqual(
      expect.objectContaining({
        orderId: values.orderId,
        outstandingQuantity: 3,
      }),
    );
    await expect(
      asStaff.query(api.views.listTimeline, {
        window: { from: 50, to: 10 },
      }),
    ).rejects.toThrow("ordered bounds");
  });
});
