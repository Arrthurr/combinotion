import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { positiveInteger, required } from "./lib/validation";
import {
  applyMovement,
  reviewState,
} from "../lib/domain/inventory";
import type { MovementKind } from "../lib/domain/types";

type MovementInput = {
  titleId: Id<"titles">;
  kind: MovementKind;
  quantity: number;
  reason?: string;
  sourceId: string;
};

export async function appendInventoryMovement(
  ctx: MutationCtx,
  input: MovementInput,
) {
  const existing = await ctx.db
    .query("inventoryMovements")
    .withIndex("by_source", (q) => q.eq("sourceId", input.sourceId))
    .unique();
  if (existing) {
    return existing.titleId;
  }

  const title = await ctx.db.get(input.titleId);
  if (!title) {
    throw new Error("Title not found");
  }

  const createdAt = Date.now();
  const next = applyMovement(title, {
    id: input.sourceId,
    kind: input.kind,
    quantity: input.quantity,
    reason: input.reason,
    sourceId: input.sourceId,
    createdAt,
  });
  await ctx.db.insert("inventoryMovements", {
    titleId: input.titleId,
    kind: input.kind,
    quantity: input.quantity,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    sourceId: input.sourceId,
    createdAt,
  });
  await ctx.db.patch(input.titleId, {
    quantityOnHand: next.quantityOnHand,
    activeReservedQuantity: next.activeReservedQuantity,
  });
  return input.titleId;
}

export const listReview = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const titles = await ctx.db.query("titles").collect();
    return titles
      .map((title) => ({
        ...title,
        ...reviewState(title),
      }))
      .sort(
        (left, right) =>
          Number(right.shortage) - Number(left.shortage) ||
          Number(right.lowStock) - Number(left.lowStock) ||
          Number(right.reorderNeeded) - Number(left.reorderNeeded) ||
          left.title.localeCompare(right.title),
      );
  },
});

export const listHistory = query({
  args: { titleId: v.id("titles") },
  handler: async (ctx, { titleId }) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("inventoryMovements")
      .withIndex("by_title", (q) => q.eq("titleId", titleId))
      .order("desc")
      .collect();
  },
});

export const correctOnHand = mutation({
  args: {
    titleId: v.id("titles"),
    quantityOnHand: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, { titleId, quantityOnHand, reason }) => {
    await requireStaff(ctx);
    const cleanReason = required(reason, "Reason");
    if (!Number.isInteger(quantityOnHand) || quantityOnHand < 0) {
      throw new Error("On-hand quantity must be a non-negative whole number");
    }
    const title = await ctx.db.get(titleId);
    if (!title) {
      throw new Error("Title not found");
    }
    const quantity = quantityOnHand - title.quantityOnHand;
    if (quantity === 0) {
      throw new Error("On-hand quantity is already at that value");
    }
    return await appendInventoryMovement(ctx, {
      titleId,
      kind: "adjustment",
      quantity,
      reason: cleanReason,
      sourceId: `adjustment:${titleId}:${Date.now()}`,
    });
  },
});

export const recordOpeningBalance = mutation({
  args: {
    titleId: v.id("titles"),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, { titleId, quantity, reason }) => {
    await requireStaff(ctx);
    const cleanReason = required(reason, "Reason");
    positiveInteger(quantity);
    const sourceId = `openingBalance:${titleId}`;
    const existing = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
      .unique();
    if (existing) {
      return existing.titleId;
    }
    const title = await ctx.db.get(titleId);
    if (!title) {
      throw new Error("Title not found");
    }
    const priorMovement = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_title", (q) => q.eq("titleId", titleId))
      .first();
    if (title.quantityOnHand !== 0 || priorMovement) {
      throw new Error(
        "Opening balance can only be recorded when on-hand is zero and the title has no movements",
      );
    }
    return await appendInventoryMovement(ctx, {
      titleId,
      kind: "openingBalance",
      quantity,
      reason: cleanReason,
      sourceId,
    });
  },
});

export const markReorderNeeded = mutation({
  args: { titleId: v.id("titles"), needed: v.boolean() },
  handler: async (ctx, { titleId, needed }) => {
    await requireStaff(ctx);
    const title = await ctx.db.get(titleId);
    if (!title) {
      throw new Error("Title not found");
    }
    await ctx.db.patch(titleId, { reorderNeeded: needed });
    return titleId;
  },
});
