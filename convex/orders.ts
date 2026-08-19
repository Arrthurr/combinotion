import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { appendInventoryMovement } from "./inventory";
import { requireStaff } from "./lib/auth";
import { positiveInteger } from "./lib/validation";
import {
  nextOrderStatus,
  outstandingQuantity,
} from "../lib/domain/orders";

async function orderDetails(ctx: QueryCtx, order: Doc<"orders">) {
  const supplier = await ctx.db.get(order.supplierId);
  if (!supplier) {
    throw new Error("Supplier not found");
  }
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  const detailedLines = await Promise.all(
    lines.map(async (line) => {
      const title = await ctx.db.get(line.titleId);
      if (!title) {
        throw new Error("Title not found");
      }
      return {
        ...line,
        titleName: title.title,
        outstandingQuantity: outstandingQuantity(
          line.orderedQuantity,
          line.receivedQuantity,
        ),
      };
    }),
  );
  return {
    ...order,
    supplierName: supplier.name,
    lines: detailedLines,
    displayStatus: nextOrderStatus(order.status, detailedLines),
  };
}

export const createOrder = mutation({
  args: {
    supplierId: v.id("suppliers"),
    lines: v.array(
      v.object({
        titleId: v.id("titles"),
        orderedQuantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, { supplierId, lines }) => {
    await requireStaff(ctx);
    const supplier = await ctx.db.get(supplierId);
    if (!supplier) {
      throw new Error("Supplier not found");
    }
    if (lines.length === 0) {
      throw new Error("An order requires at least one line");
    }

    const titleIds = new Set<string>();
    const titles = await Promise.all(
      lines.map(async (line) => {
        positiveInteger(line.orderedQuantity, "Ordered quantity");
        if (titleIds.has(line.titleId)) {
          throw new Error("A title can appear only once on an order");
        }
        titleIds.add(line.titleId);
        const title = await ctx.db.get(line.titleId);
        if (!title) {
          throw new Error("Title not found");
        }
        return title;
      }),
    );

    const orderId = await ctx.db.insert("orders", {
      supplierId,
      status: "needed",
    });
    await Promise.all(
      lines.map((line) =>
        ctx.db.insert("orderLines", {
          orderId,
          titleId: line.titleId,
          orderedQuantity: line.orderedQuantity,
          receivedQuantity: 0,
        }),
      ),
    );
    await Promise.all(
      titles.map((title) =>
        ctx.db.patch(title._id, { reorderNeeded: false }),
      ),
    );
    return orderId;
  },
});

export const addOrderLine = mutation({
  args: {
    orderId: v.id("orders"),
    titleId: v.id("titles"),
    orderedQuantity: v.number(),
  },
  handler: async (ctx, { orderId, titleId, orderedQuantity }) => {
    await requireStaff(ctx);
    positiveInteger(orderedQuantity, "Ordered quantity");
    const order = await ctx.db.get(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.status === "received") {
      throw new Error("Lines cannot be added to a received order");
    }
    const title = await ctx.db.get(titleId);
    if (!title) {
      throw new Error("Title not found");
    }
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    if (lines.some((line) => line.titleId === titleId)) {
      throw new Error("A title can appear only once on an order");
    }
    const lineId = await ctx.db.insert("orderLines", {
      orderId,
      titleId,
      orderedQuantity,
      receivedQuantity: 0,
    });
    await ctx.db.patch(titleId, { reorderNeeded: false });
    return lineId;
  },
});

export const markOrdered = mutation({
  args: {
    orderId: v.id("orders"),
    expectedAt: v.optional(v.number()),
  },
  handler: async (ctx, { orderId, expectedAt }) => {
    await requireStaff(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.status !== "needed") {
      throw new Error("Only needed orders can be marked ordered");
    }
    await ctx.db.patch(orderId, {
      status: "ordered",
      orderedAt: Date.now(),
      ...(expectedAt === undefined ? {} : { expectedAt }),
    });
    return orderId;
  },
});

export const receiveLine = mutation({
  args: {
    orderLineId: v.id("orderLines"),
    receivedQuantity: v.number(),
  },
  handler: async (ctx, { orderLineId, receivedQuantity }) => {
    await requireStaff(ctx);
    const line = await ctx.db.get(orderLineId);
    if (!line) {
      throw new Error("Order line not found");
    }
    const order = await ctx.db.get(line.orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (receivedQuantity === line.receivedQuantity) {
      return order._id;
    }
    if (
      !Number.isInteger(receivedQuantity) ||
      receivedQuantity <= line.receivedQuantity
    ) {
      throw new Error(
        "Received quantity must be a whole number greater than the current received quantity",
      );
    }
    if (receivedQuantity > line.orderedQuantity) {
      throw new Error("Received quantity cannot exceed ordered quantity");
    }

    await appendInventoryMovement(ctx, {
      titleId: line.titleId,
      kind: "receipt",
      quantity: receivedQuantity - line.receivedQuantity,
      sourceId: `receipt:${orderLineId}:${receivedQuantity}`,
    });
    await ctx.db.patch(orderLineId, { receivedQuantity });

    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    await ctx.db.patch(order._id, {
      status: nextOrderStatus(order.status, lines),
    });
    return order._id;
  },
});

export const listOrders = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const orders = await ctx.db.query("orders").order("desc").collect();
    return await Promise.all(orders.map((order) => orderDetails(ctx, order)));
  },
});

export const getOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireStaff(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    return await orderDetails(ctx, order);
  },
});
