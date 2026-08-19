/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("review moderation", () => {
  it("requires staff for listing and approval changes", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.reviews.list, {})).rejects.toThrow(
      "Authentication required",
    );
    const reviewId = await t.run(async (ctx) => {
      const titleId = await ctx.db.insert("titles", {
        title: "A Good Book",
        author: "Ann Author",
        isbn: "1",
        quantityOnHand: 0,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      });
      return await ctx.db.insert("reviews", {
        titleId,
        reviewer: "Rae Reviewer",
        feedback: "Ready for class.",
        score: 5,
        approved: false,
      });
    });
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .mutation(api.reviews.setApproved, {
          reviewId,
          approved: true,
        }),
    ).rejects.toThrow("Staff membership required");
  });

  it("lists review details and changes only approval state", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_1",
      email: "coo@example.com",
    });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const { reviewId, titleId } = await t.run(async (ctx) => {
      const titleId = await ctx.db.insert("titles", {
        title: "A Good Book",
        author: "Ann Author",
        isbn: "1",
        quantityOnHand: 0,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      });
      const reviewId = await ctx.db.insert("reviews", {
        titleId,
        reviewer: "Rae Reviewer",
        feedback: "Ready for class.",
        score: 4,
        approved: false,
      });
      return { reviewId, titleId };
    });

    await expect(asStaff.query(api.reviews.list, {})).resolves.toEqual([
      {
        reviewId,
        titleId,
        title: "A Good Book",
        reviewer: "Rae Reviewer",
        feedback: "Ready for class.",
        score: 4,
        approved: false,
      },
    ]);

    await asStaff.mutation(api.reviews.setApproved, {
      reviewId,
      approved: true,
    });
    await asStaff.mutation(api.reviews.setApproved, {
      reviewId,
      approved: true,
    });
    const stored = await t.run(async (ctx) => ctx.db.get(reviewId));
    expect(stored).toEqual(
      expect.objectContaining({
        reviewer: "Rae Reviewer",
        feedback: "Ready for class.",
        score: 4,
        approved: true,
      }),
    );
  });
});
