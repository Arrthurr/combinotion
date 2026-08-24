import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireStaff } from "./lib/auth";

export const assertStaff = internalQuery({
  args: {},
  handler: async (ctx) => await requireStaff(ctx),
});

/** `npx convex run staff:seedStaff '{"clerkId":"<clerk subject>","email":"<email>"}'` */
export const seedStaff = internalMutation({
  args: { clerkId: v.string(), email: v.string() },
  handler: async (ctx, { clerkId, email }) => {
    const existing = await ctx.db.query("staff").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("staff", { clerkId, email });
  },
});

/** `npx convex run staff:removeStaff '{"clerkId":"<clerk subject>"}'` */
export const removeStaff = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const existing = await ctx.db
      .query("staff")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
