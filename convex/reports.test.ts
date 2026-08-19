/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("popularity report", () => {
  it("requires staff", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.reports.popularity, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .query(api.reports.popularity, {}),
    ).rejects.toThrow("Staff membership required");
  });

  it("derives metrics from canonical rows", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_1",
      email: "coo@example.com",
    });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const titleId = await t.run(async (ctx) => {
      const titleId = await ctx.db.insert("titles", {
        title: "A Good Book",
        author: "Ann Author",
        isbn: "1",
        quantityOnHand: 0,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      });
      const schoolId = await ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      });
      const requestId = await ctx.db.insert("schoolRequests", {
        schoolId,
        schoolName: "Joy School",
        schoolAddress: "1 Main Street",
        contactName: "Pat Reader",
        email: "pat@example.com",
        status: "cancelled",
        matchStatus: "attached",
        reference: "REQ-1",
        createdAt: 1,
      });
      await ctx.db.insert("reservations", {
        titleId,
        schoolRequestId: requestId,
        quantity: 0,
        active: false,
      });
      await ctx.db.insert("reservations", {
        titleId,
        schoolRequestId: requestId,
        quantity: 2,
        active: true,
      });
      const visitId = await ctx.db.insert("visits", {
        schoolId,
        occurredAt: 2,
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
      await ctx.db.insert("visitBooks", {
        visitId,
        titleId,
        donatedQuantity: 2,
        readAloud: false,
        consumptionStatus: "none",
        consumedQuantity: 0,
      });
      await ctx.db.insert("reviews", {
        titleId,
        reviewer: "First Reviewer",
        feedback: "Useful.",
        score: 2,
        approved: false,
      });
      await ctx.db.insert("reviews", {
        titleId,
        reviewer: "Second Reviewer",
        feedback: "Excellent.",
        score: 4,
        approved: true,
      });
      return titleId;
    });

    await expect(asStaff.query(api.reports.popularity, {})).resolves.toEqual([
      {
        titleId,
        title: "A Good Book",
        author: "Ann Author",
        requestCount: 1,
        donatedQuantity: 5,
        averageScore: 3,
      },
    ]);
  });
});
