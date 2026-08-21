import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { loadOrgSettings } from "./orgSettings";
import { orgThreshold } from "../lib/domain/orgSettings";
import { positiveInteger, required } from "./lib/validation";
import {
  applyMovement,
  reviewState,
  reverseMovement,
} from "../lib/domain/inventory";
import type {
  MovementKind,
  StockState,
} from "../lib/domain/types";

type MovementInput = {
  titleId: Id<"titles">;
  kind: MovementKind;
  quantity: number;
  reason?: string;
  sourceId: string;
};

async function persistInventoryMovement(
  ctx: MutationCtx,
  input: MovementInput,
  createdAt: number,
  next: StockState,
) {
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
}

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
  await persistInventoryMovement(ctx, input, createdAt, next);
  return input.titleId;
}

function oppositeMovement(
  kind: MovementKind,
  quantity: number,
): Pick<MovementInput, "kind" | "quantity"> {
  switch (kind) {
    case "receipt":
    case "openingBalance":
      return { kind: "donation", quantity };
    case "adjustment":
      return { kind: "adjustment", quantity: -quantity };
    case "donation":
      return { kind: "receipt", quantity };
    case "reservation":
      return { kind: "release", quantity };
    case "release":
    case "reservationConsumption":
      return { kind: "reservation", quantity };
    default: {
      const unhandledKind: never = kind;
      throw new Error(`Unhandled movement kind: ${unhandledKind}`);
    }
  }
}

export async function reverseInventoryMovement(
  ctx: MutationCtx,
  sourceId: string,
) {
  const original = await ctx.db
    .query("inventoryMovements")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .unique();
  if (!original) {
    return null;
  }
  const reverseSourceId = `reverse:${sourceId}`;
  const existingReverse = await ctx.db
    .query("inventoryMovements")
    .withIndex("by_source", (q) => q.eq("sourceId", reverseSourceId))
    .unique();
  if (existingReverse) {
    return existingReverse.titleId;
  }
  const title = await ctx.db.get(original.titleId);
  if (!title) {
    throw new Error("Title not found");
  }
  const createdAt = Date.now();
  const next = reverseMovement(title, {
    id: original._id,
    kind: original.kind,
    quantity: original.quantity,
    reason: original.reason,
    sourceId: original.sourceId,
    createdAt: original.createdAt,
  });
  const opposite = oppositeMovement(original.kind, original.quantity);
  await persistInventoryMovement(
    ctx,
    {
      titleId: original.titleId,
      ...opposite,
      ...(original.reason === undefined ? {} : { reason: original.reason }),
      sourceId: reverseSourceId,
    },
    createdAt,
    next,
  );
  return original.titleId;
}

export const listReview = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const threshold = orgThreshold(await loadOrgSettings(ctx));
    const titles = await ctx.db.query("titles").collect();
    return titles
      .map((title) => ({
        ...title,
        ...reviewState(title, threshold),
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
