import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/auth";

export type ModerationReview = {
  reviewId: Id<"reviews">;
  titleId: Id<"titles">;
  title: string;
  reviewer: string;
  feedback: string;
  score: number;
  approved: boolean;
};

export const list = query({
  args: {},
  handler: async (ctx): Promise<ModerationReview[]> => {
    await requireStaff(ctx);
    const reviews = await ctx.db.query("reviews").collect();
    const joined = await Promise.all(
      reviews.map(async (review) => {
        const title = await ctx.db.get(review.titleId);
        if (!title) {
          throw new Error("Title not found");
        }
        return {
          reviewId: review._id,
          titleId: review.titleId,
          title: title.title,
          reviewer: review.reviewer,
          feedback: review.feedback,
          score: review.score,
          approved: review.approved,
          createdAt: review._creationTime,
        };
      }),
    );
    return joined
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          right.createdAt - left.createdAt,
      )
      .map(({ createdAt: _createdAt, ...review }) => review);
  },
});

export const setApproved = mutation({
  args: {
    reviewId: v.id("reviews"),
    approved: v.boolean(),
  },
  handler: async (ctx, { reviewId, approved }) => {
    await requireStaff(ctx);
    await ctx.db.patch(reviewId, { approved });
    return reviewId;
  },
});
