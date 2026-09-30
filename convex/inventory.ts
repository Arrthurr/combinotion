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
  availableQuantity,
  reviewState,
  reverseMovement,
} from "../lib/domain/inventory";
import type {
  MovementKind,
  StockState,
} from "../lib/domain/types";

type PhysicalMovementKind = Extract<
  MovementKind,
  "openingBalance" | "receipt" | "adjustment" | "donation"
>;

type ReservationMovementKind = Extract<
  MovementKind,
  "reservation" | "release" | "reservationConsumption"
>;

type MovementInput = {
  titleId: Id<"titles">;
  kind: MovementKind;
  quantity: number;
  reason?: string;
  sourceId: string;
};

const RESERVATION_KIND_ERROR =
  "Reservation stock changes go through reserve, release, consume, or restore";

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

function isReservationKind(
  kind: MovementKind,
): kind is ReservationMovementKind {
  return (
    kind === "reservation" ||
    kind === "release" ||
    kind === "reservationConsumption"
  );
}

async function movementForSource(ctx: MutationCtx, sourceId: string) {
  return await ctx.db
    .query("inventoryMovements")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .unique();
}

async function writeMovement(
  ctx: MutationCtx,
  input: MovementInput,
) {
  const existing = await movementForSource(ctx, input.sourceId);
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

export async function appendInventoryMovement(
  ctx: MutationCtx,
  input: {
    titleId: Id<"titles">;
    kind: PhysicalMovementKind;
    quantity: number;
    reason?: string;
    sourceId: string;
  },
) {
  if (isReservationKind(input.kind)) {
    throw new Error(RESERVATION_KIND_ERROR);
  }
  return await writeMovement(ctx, input);
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
  const original = await movementForSource(ctx, sourceId);
  if (!original) {
    return null;
  }
  if (isReservationKind(original.kind)) {
    throw new Error(RESERVATION_KIND_ERROR);
  }
  const reverseSourceId = `reverse:${sourceId}`;
  const existingReverse = await movementForSource(ctx, reverseSourceId);
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

async function requireReservation(
  ctx: MutationCtx,
  reservationId: Id<"reservations">,
) {
  const reservation = await ctx.db.get(reservationId);
  if (!reservation) {
    throw new Error("Reservation not found");
  }
  return reservation;
}

export async function reserveTitle(
  ctx: MutationCtx,
  input: {
    titleId: Id<"titles">;
    schoolRequestId: Id<"schoolRequests">;
    quantity: number;
    sourceId: string;
  },
) {
  positiveInteger(input.quantity);
  const existing = await movementForSource(ctx, input.sourceId);
  if (existing) {
    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_request", (q) =>
        q.eq("schoolRequestId", input.schoolRequestId),
      )
      .collect();
    const match = reservations.find(
      (row) => row.titleId === existing.titleId,
    );
    if (!match) {
      throw new Error("Reservation not found");
    }
    return match._id;
  }

  const title = await ctx.db.get(input.titleId);
  if (!title) {
    throw new Error("Title not found");
  }
  if (input.quantity > availableQuantity(title)) {
    throw new Error("Those copies are no longer available");
  }

  const reservationId = await ctx.db.insert("reservations", {
    titleId: input.titleId,
    schoolRequestId: input.schoolRequestId,
    quantity: input.quantity,
    active: true,
  });
  await writeMovement(ctx, {
    titleId: input.titleId,
    kind: "reservation",
    quantity: input.quantity,
    sourceId: input.sourceId,
  });
  return reservationId;
}

export async function releaseReservation(
  ctx: MutationCtx,
  input: {
    reservationId: Id<"reservations">;
    sourceId: string;
  },
) {
  const reservation = await requireReservation(ctx, input.reservationId);
  if (!reservation.active) {
    return reservation._id;
  }
  const existing = await movementForSource(ctx, input.sourceId);
  if (existing) {
    return reservation._id;
  }
  await writeMovement(ctx, {
    titleId: reservation.titleId,
    kind: "release",
    quantity: reservation.quantity,
    sourceId: input.sourceId,
  });
  await ctx.db.patch(reservation._id, { active: false });
  return reservation._id;
}

export async function consumeReservation(
  ctx: MutationCtx,
  input: {
    reservationId: Id<"reservations">;
    quantity: number;
    sourceId: string;
  },
) {
  positiveInteger(input.quantity);
  const existing = await movementForSource(ctx, input.sourceId);
  if (existing) {
    return input.reservationId;
  }
  const reservation = await requireReservation(ctx, input.reservationId);
  if (!reservation.active) {
    throw new Error("Reservation is inactive");
  }
  if (input.quantity > reservation.quantity) {
    throw new Error("Cannot consume more than the reservation holds");
  }
  await writeMovement(ctx, {
    titleId: reservation.titleId,
    kind: "reservationConsumption",
    quantity: input.quantity,
    sourceId: input.sourceId,
  });
  const remaining = reservation.quantity - input.quantity;
  await ctx.db.patch(reservation._id, {
    quantity: remaining,
    active: remaining > 0,
  });
  return reservation._id;
}

export async function restoreReservation(
  ctx: MutationCtx,
  input: {
    reservationId: Id<"reservations">;
    quantity: number;
    sourceId: string;
  },
) {
  positiveInteger(input.quantity);
  const existing = await movementForSource(ctx, input.sourceId);
  if (existing) {
    return input.reservationId;
  }
  const reservation = await requireReservation(ctx, input.reservationId);
  await writeMovement(ctx, {
    titleId: reservation.titleId,
    kind: "reservation",
    quantity: input.quantity,
    sourceId: input.sourceId,
  });
  await ctx.db.patch(reservation._id, {
    quantity: reservation.quantity + input.quantity,
    active: true,
  });
  return reservation._id;
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

export async function writeOpeningBalance(
  ctx: MutationCtx,
  input: {
    titleId: Id<"titles">;
    quantity: number;
    reason: string;
  },
) {
  const cleanReason = required(input.reason, "Reason");
  positiveInteger(input.quantity);
  const sourceId = `openingBalance:${input.titleId}`;
  const existing = await ctx.db
    .query("inventoryMovements")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .unique();
  if (existing) {
    return existing.titleId;
  }
  const title = await ctx.db.get(input.titleId);
  if (!title) {
    throw new Error("Title not found");
  }
  const priorMovement = await ctx.db
    .query("inventoryMovements")
    .withIndex("by_title", (q) => q.eq("titleId", input.titleId))
    .first();
  if (title.quantityOnHand !== 0 || priorMovement) {
    throw new Error(
      "Opening balance can only be recorded when on-hand is zero and the title has no movements",
    );
  }
  return await appendInventoryMovement(ctx, {
    titleId: input.titleId,
    kind: "openingBalance",
    quantity: input.quantity,
    reason: cleanReason,
    sourceId,
  });
}

export const recordOpeningBalance = mutation({
  args: {
    titleId: v.id("titles"),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, { titleId, quantity, reason }) => {
    await requireStaff(ctx);
    return await writeOpeningBalance(ctx, { titleId, quantity, reason });
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
