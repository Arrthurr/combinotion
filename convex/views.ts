import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { outstandingQuantity } from "../lib/domain/orders";
import {
  buildTimeline,
  DEFAULT_TABLE_COLUMNS,
  sanitizeTableColumns,
  type TimelineInputs,
  type VisitBoardData,
  type VisitPlanResolution,
} from "../lib/domain/views";

const tableColumnValidator = v.union(
  v.literal("author"),
  v.literal("isbn"),
  v.literal("quantityOnHand"),
  v.literal("activeReservedQuantity"),
  v.literal("availableQuantity"),
  v.literal("lowStock"),
  v.literal("shortage"),
  v.literal("reorderNeeded"),
  v.literal("synopsis"),
  v.literal("notes"),
  v.literal("purchaseInfo"),
);

const visitPlanStageValidator = v.union(
  v.literal("readerConfirmation"),
  v.literal("schoolContact"),
  v.literal("securingBooks"),
);

const visitPlanResolutionValidator = v.union(
  v.object({
    kind: v.literal("visited"),
    visitId: v.id("visits"),
  }),
  v.object({
    kind: v.literal("archived"),
  }),
);

function emptyVisitPlanColumns<
  PlanId = string,
  SchoolId = string,
>(): VisitBoardData<PlanId, SchoolId>["columns"] {
  return {
    readerConfirmation: [],
    schoolContact: [],
    securingBooks: [],
  };
}

function sameResolution<VisitId>(
  left: VisitPlanResolution<VisitId>,
  right: VisitPlanResolution<VisitId>,
) {
  switch (left.kind) {
    case "visited":
      return right.kind === "visited" && left.visitId === right.visitId;
    case "archived":
      return right.kind === "archived";
    default: {
      const unhandledResolution: never = left;
      throw new Error(`Unhandled visit plan resolution: ${unhandledResolution}`);
    }
  }
}

export const getTableColumns = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireStaff(ctx);
    const config = await ctx.db
      .query("viewConfigs")
      .withIndex("by_clerkId", (q) =>
        q.eq("clerkId", identity.subject),
      )
      .unique();
    return config === null
      ? [...DEFAULT_TABLE_COLUMNS]
      : sanitizeTableColumns(config.tableColumns);
  },
});

export const setTableColumns = mutation({
  args: {
    columns: v.array(tableColumnValidator),
  },
  handler: async (ctx, { columns }) => {
    const identity = await requireStaff(ctx);
    const tableColumns = sanitizeTableColumns(columns);
    const existing = await ctx.db
      .query("viewConfigs")
      .withIndex("by_clerkId", (q) =>
        q.eq("clerkId", identity.subject),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { tableColumns });
      return;
    }
    await ctx.db.insert("viewConfigs", {
      clerkId: identity.subject,
      tableColumns,
    });
  },
});

export const listVisitBoard = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    VisitBoardData<
      Id<"visitPlans">,
      Id<"schools">,
      Id<"visits">
    >
  > => {
    await requireStaff(ctx);
    const plans = await ctx.db.query("visitPlans").collect();
    const columns = emptyVisitPlanColumns<
      Id<"visitPlans">,
      Id<"schools">
    >();
    const recentlyVisited: VisitBoardData<
      Id<"visitPlans">,
      Id<"schools">,
      Id<"visits">
    >["recentlyVisited"] = [];

    for (const plan of plans) {
      if (plan.resolution === undefined) {
        const school = await ctx.db.get(plan.schoolId);
        if (!school) {
          throw new Error("School not found");
        }
        columns[plan.stage].push({
          planId: plan._id,
          schoolId: plan.schoolId,
          schoolName: school.name,
          stage: plan.stage,
          ...(plan.plannedFor === undefined
            ? {}
            : { plannedFor: plan.plannedFor }),
          ...(plan.notes === undefined ? {} : { notes: plan.notes }),
        });
        continue;
      }

      switch (plan.resolution.kind) {
        case "archived":
          break;
        case "visited": {
          const visit = await ctx.db.get(plan.resolution.visitId);
          if (!visit) {
            break;
          }
          const [school, books] = await Promise.all([
            ctx.db.get(visit.schoolId),
            ctx.db
              .query("visitBooks")
              .withIndex("by_visit", (q) =>
                q.eq("visitId", visit._id),
              )
              .collect(),
          ]);
          if (!school) {
            throw new Error("School not found");
          }
          recentlyVisited.push({
            planId: plan._id,
            visitId: visit._id,
            schoolName: school.name,
            occurredAt: visit.occurredAt,
            donatedQuantity: books.reduce(
              (total, book) => total + book.donatedQuantity,
              0,
            ),
            ...(visit.followUp === undefined
              ? {}
              : { followUp: visit.followUp }),
          });
          break;
        }
        default: {
          const unhandledResolution: never = plan.resolution;
          throw new Error(
            `Unhandled visit plan resolution: ${unhandledResolution}`,
          );
        }
      }
    }

    return {
      columns,
      recentlyVisited: recentlyVisited
        .sort((left, right) => right.occurredAt - left.occurredAt)
        .slice(0, 10),
    };
  },
});

export const saveVisitPlan = mutation({
  args: {
    planId: v.optional(v.id("visitPlans")),
    schoolId: v.id("schools"),
    stage: visitPlanStageValidator,
    plannedFor: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { planId, schoolId, stage, plannedFor, notes },
  ) => {
    await requireStaff(ctx);
    if (!(await ctx.db.get(schoolId))) {
      throw new Error("School not found");
    }
    if (plannedFor !== undefined && !Number.isFinite(plannedFor)) {
      throw new Error("Planned date must be finite");
    }
    const cleanNotes = notes?.trim();
    const value = {
      schoolId,
      stage,
      ...(plannedFor === undefined ? {} : { plannedFor }),
      ...(cleanNotes ? { notes: cleanNotes } : {}),
    };
    if (planId === undefined) {
      return await ctx.db.insert("visitPlans", value);
    }
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error("Visit plan not found");
    }
    if (plan.resolution !== undefined) {
      throw new Error("Resolved visit plans cannot be edited");
    }
    await ctx.db.replace(planId, value);
    return planId;
  },
});

export const setVisitPlanStage = mutation({
  args: {
    planId: v.id("visitPlans"),
    stage: visitPlanStageValidator,
  },
  handler: async (ctx, { planId, stage }) => {
    await requireStaff(ctx);
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error("Visit plan not found");
    }
    if (plan.resolution !== undefined) {
      throw new Error("Resolved visit plans cannot be moved");
    }
    if (plan.stage !== stage) {
      await ctx.db.patch(planId, { stage });
    }
    return planId;
  },
});

export const resolveVisitPlan = mutation({
  args: {
    planId: v.id("visitPlans"),
    resolution: visitPlanResolutionValidator,
  },
  handler: async (ctx, { planId, resolution }) => {
    await requireStaff(ctx);
    const plan = await ctx.db.get(planId);
    if (!plan) {
      throw new Error("Visit plan not found");
    }
    if (plan.resolution !== undefined) {
      if (sameResolution(plan.resolution, resolution)) {
        return planId;
      }
      throw new Error("Visit plan already has a different resolution");
    }

    switch (resolution.kind) {
      case "archived":
        break;
      case "visited": {
        const visit = await ctx.db.get(resolution.visitId);
        if (!visit) {
          throw new Error("Visit not found");
        }
        if (visit.schoolId !== plan.schoolId) {
          throw new Error("Visit must belong to the planned school");
        }
        break;
      }
      default: {
        const unhandledResolution: never = resolution;
        throw new Error(
          `Unhandled visit plan resolution: ${unhandledResolution}`,
        );
      }
    }

    await ctx.db.patch(planId, { resolution });
    return planId;
  },
});

export const listTimeline = query({
  args: {
    window: v.object({
      from: v.number(),
      to: v.number(),
    }),
  },
  handler: async (ctx, { window }) => {
    await requireStaff(ctx);
    if (
      !Number.isFinite(window.from) ||
      !Number.isFinite(window.to) ||
      window.from > window.to
    ) {
      throw new Error("Timeline window must have finite ordered bounds");
    }

    const [orders, movements, visits] = await Promise.all([
      ctx.db.query("orders").collect(),
      ctx.db.query("inventoryMovements").collect(),
      ctx.db.query("visits").collect(),
    ]);

    const orderInputs = await Promise.all(
      orders
        .filter(
          (order) =>
            (order.orderedAt !== undefined &&
              order.orderedAt >= window.from &&
              order.orderedAt <= window.to) ||
            (order.status === "ordered" &&
              order.expectedAt !== undefined &&
              order.expectedAt >= window.from &&
              order.expectedAt <= window.to),
        )
        .map(async (order) => {
          const [supplier, lines] = await Promise.all([
            ctx.db.get(order.supplierId),
            ctx.db
              .query("orderLines")
              .withIndex("by_order", (q) =>
                q.eq("orderId", order._id),
              )
              .collect(),
          ]);
          if (!supplier) {
            throw new Error("Supplier not found");
          }
          return {
            orderId: order._id,
            supplierName: supplier.name,
            status: order.status,
            ...(order.orderedAt === undefined
              ? {}
              : { orderedAt: order.orderedAt }),
            ...(order.expectedAt === undefined
              ? {}
              : { expectedAt: order.expectedAt }),
            titleCount: lines.length,
            outstandingQuantity: lines.reduce(
              (total, line) =>
                total +
                outstandingQuantity(
                  line.orderedQuantity,
                  line.receivedQuantity,
                ),
              0,
            ),
          };
        }),
    );

    const movementInputs = await Promise.all(
      movements
        .filter(
          (movement) =>
            movement.createdAt >= window.from &&
            movement.createdAt <= window.to,
        )
        .map(async (movement) => {
          const title = await ctx.db.get(movement.titleId);
          if (!title) {
            throw new Error("Title not found");
          }
          return {
            movementId: movement._id,
            movementKind: movement.kind,
            createdAt: movement.createdAt,
            titleId: title._id,
            titleName: title.title,
            quantity: movement.quantity,
            ...(movement.reason === undefined
              ? {}
              : { reason: movement.reason }),
          };
        }),
    );

    const visitInputs = await Promise.all(
      visits
        .filter(
          (visit) =>
            visit.occurredAt >= window.from &&
            visit.occurredAt <= window.to,
        )
        .map(async (visit) => {
          const [school, books] = await Promise.all([
            ctx.db.get(visit.schoolId),
            ctx.db
              .query("visitBooks")
              .withIndex("by_visit", (q) =>
                q.eq("visitId", visit._id),
              )
              .collect(),
          ]);
          if (!school) {
            throw new Error("School not found");
          }
          return {
            visitId: visit._id,
            schoolName: school.name,
            occurredAt: visit.occurredAt,
            donatedQuantity: books.reduce(
              (total, book) => total + book.donatedQuantity,
              0,
            ),
          };
        }),
    );

    const inputs: TimelineInputs<
      Id<"orders">,
      Id<"titles">,
      Id<"visits">
    > = {
      orders: orderInputs,
      movements: movementInputs,
      visits: visitInputs,
    };
    return buildTimeline(inputs, window);
  },
});
