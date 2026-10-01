import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { UserIdentity } from "convex/server";
import { internal } from "../_generated/api";
import {
  action,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

export async function requireStaff(ctx: QueryCtx | MutationCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication required");
  const member = await ctx.db
    .query("staff")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!member) throw new Error("Staff membership required");
  return identity;
}

// Authorization runs before the handler; identity is trusted staff context.
export const staffQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ identity: await requireStaff(ctx) })),
);

export const staffMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ identity: await requireStaff(ctx) })),
);

// Actions have no database context, so use the same rule via an internal query.
export const staffAction = customAction(
  action,
  customCtx(async (ctx): Promise<{ identity: UserIdentity }> => ({
    identity: await ctx.runQuery(internal.staff.assertStaff, {}),
  })),
);
