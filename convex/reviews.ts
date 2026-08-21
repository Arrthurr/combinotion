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

export const createReview = mutation({
  args: {
    titleId: v.id("titles"),
    reviewer: v.string(),
    feedback: v.string(),
    score: v.number(),
    approved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (!(await ctx.db.get(args.titleId))) {
      throw new Error("Title not found");
    }
    if (!args.reviewer.trim()) {
      throw new Error("Reviewer is required");
    }
    if (!args.feedback.trim()) {
      throw new Error("Feedback is required");
    }
    if (!Number.isFinite(args.score)) {
      throw new Error("Score must be a number");
    }
    return await ctx.db.insert("reviews", {
      titleId: args.titleId,
      reviewer: args.reviewer.trim(),
      feedback: args.feedback.trim(),
      score: args.score,
      approved: args.approved ?? false,
    });
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
