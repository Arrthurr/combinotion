import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import {
  defaultOrgSettings,
  type OrgSettings,
  type PublicRequests,
} from "../lib/domain/orgSettings";

async function readSettings(
  ctx: QueryCtx | MutationCtx,
): Promise<OrgSettings> {
  const row = await ctx.db
    .query("orgSettings")
    .withIndex("by_key", (q) => q.eq("key", "org"))
    .unique();
  if (!row) {
    return defaultOrgSettings();
  }
  return {
    lowStockThreshold: row.lowStockThreshold,
    publicRequests: row.publicRequests,
  };
}

export async function loadOrgSettings(ctx: QueryCtx | MutationCtx) {
  return await readSettings(ctx);
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await readSettings(ctx);
  },
});

export const publicRequestGate = query({
  args: {},
  handler: async (ctx) => {
    const settings = await readSettings(ctx);
    return { publicRequests: settings.publicRequests };
  },
});

export const update = mutation({
  args: {
    lowStockThreshold: v.number(),
    publicRequests: v.union(
      v.object({ kind: v.literal("open") }),
      v.object({
        kind: v.literal("paused"),
        message: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (!Number.isInteger(args.lowStockThreshold) || args.lowStockThreshold < 1) {
      throw new Error("Low-stock threshold must be a positive whole number");
    }
    const publicRequests: PublicRequests = args.publicRequests;
    const existing = await ctx.db
      .query("orgSettings")
      .withIndex("by_key", (q) => q.eq("key", "org"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lowStockThreshold: args.lowStockThreshold,
        publicRequests,
      });
    } else {
      await ctx.db.insert("orgSettings", {
        key: "org",
        lowStockThreshold: args.lowStockThreshold,
        publicRequests,
      });
    }
    return {
      lowStockThreshold: args.lowStockThreshold,
      publicRequests,
    };
  },
});
