import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** `npx convex run staff:seedStaff '{"clerkId":"<clerk subject>","email":"<email>"}'` */
export const seedStaff = internalMutation({
  args: { clerkId: v.string(), email: v.string() },
  handler: async (ctx, { clerkId, email }) => {
    const existing = await ctx.db.query("staff").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("staff", { clerkId, email });
  },
});
