import type { MutationCtx, QueryCtx } from "../_generated/server";
export async function requireStaff(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");
  const member = await ctx.db.query("staff").withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject)).unique();
  if (!member) throw new Error("Staff membership required");
  return identity;
}
