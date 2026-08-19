import type { MovementKind, OrderStatus } from "./types";

export const TABLE_COLUMNS = [
  "author",
  "isbn",
  "quantityOnHand",
  "activeReservedQuantity",
  "availableQuantity",
  "lowStock",
  "shortage",
  "reorderNeeded",
  "synopsis",
  "notes",
  "purchaseInfo",
] as const;

export type TableColumn = (typeof TABLE_COLUMNS)[number];

export const DEFAULT_TABLE_COLUMNS: readonly TableColumn[] = [
  "author",
  "isbn",
  "quantityOnHand",
  "availableQuantity",
  "reorderNeeded",
];

const tableColumnSet = new Set<string>(TABLE_COLUMNS);

export function sanitizeTableColumns(
  stored: readonly string[],
): TableColumn[] {
  const seen = new Set<string>();
  return stored.filter((column): column is TableColumn => {
    if (!tableColumnSet.has(column) || seen.has(column)) {
      return false;
    }
    seen.add(column);
    return true;
  });
}

export const VISIT_PLAN_STAGES = [
  "readerConfirmation",
  "schoolContact",
  "securingBooks",
] as const;

export type VisitPlanStage = (typeof VISIT_PLAN_STAGES)[number];

export function stageNeighbors(stage: VisitPlanStage): {
  previous?: VisitPlanStage;
  next?: VisitPlanStage;
} {
  switch (stage) {
    case "readerConfirmation":
      return { next: "schoolContact" };
    case "schoolContact":
      return {
        previous: "readerConfirmation",
        next: "securingBooks",
      };
    case "securingBooks":
      return { previous: "schoolContact" };
    default: {
      const unhandledStage: never = stage;
      throw new Error(`Unhandled visit plan stage: ${unhandledStage}`);
    }
  }
}

export type VisitPlanResolution<VisitId = string> =
  | { kind: "visited"; visitId: VisitId }
  | { kind: "archived" };

export type BoardCard<PlanId = string, SchoolId = string> = {
  planId: PlanId;
  schoolId: SchoolId;
  schoolName: string;
  stage: VisitPlanStage;
  plannedFor?: number;
  notes?: string;
};

export type VisitedCard<PlanId = string, VisitId = string> = {
  planId: PlanId;
  visitId: VisitId;
  schoolName: string;
  occurredAt: number;
  donatedQuantity: number;
  followUp?: string;
};

export type VisitBoardData<
  PlanId = string,
  SchoolId = string,
  VisitId = string,
> = {
  columns: Record<VisitPlanStage, BoardCard<PlanId, SchoolId>[]>;
  recentlyVisited: VisitedCard<PlanId, VisitId>[];
};

export type TimelineEvent<
  OrderId = string,
  TitleId = string,
  VisitId = string,
> =
  | {
      kind: "orderPlaced";
      at: number;
      orderId: OrderId;
      supplierName: string;
      titleCount: number;
    }
  | {
      kind: "expectedDelivery";
      at: number;
      orderId: OrderId;
      supplierName: string;
      outstandingQuantity: number;
    }
  | {
      kind: "movement";
      at: number;
      movementId: string;
      movementKind: MovementKind;
      titleId: TitleId;
      titleName: string;
      quantity: number;
      reason?: string;
    }
  | {
      kind: "visitOccurred";
      at: number;
      visitId: VisitId;
      schoolName: string;
      donatedQuantity: number;
    };

export type TimelineInputs<
  OrderId = string,
  TitleId = string,
  VisitId = string,
> = {
  orders: {
    orderId: OrderId;
    supplierName: string;
    status: OrderStatus;
    orderedAt?: number;
    expectedAt?: number;
    titleCount: number;
    outstandingQuantity: number;
  }[];
  movements: {
    movementId: string;
    movementKind: MovementKind;
    createdAt: number;
    titleId: TitleId;
    titleName: string;
    quantity: number;
    reason?: string;
  }[];
  visits: {
    visitId: VisitId;
    schoolName: string;
    occurredAt: number;
    donatedQuantity: number;
  }[];
};

export type TimelineWindow = {
  from: number;
  to: number;
};

export type TimelineResult<
  OrderId = string,
  TitleId = string,
  VisitId = string,
> = {
  events: TimelineEvent<OrderId, TitleId, VisitId>[];
  truncated: boolean;
};

export const TIMELINE_EVENT_CAP = 200;

export function buildTimeline<
  OrderId = string,
  TitleId = string,
  VisitId = string,
>(
  inputs: TimelineInputs<OrderId, TitleId, VisitId>,
  window: TimelineWindow,
): TimelineResult<OrderId, TitleId, VisitId> {
  const events: TimelineEvent<OrderId, TitleId, VisitId>[] = [];

  for (const order of inputs.orders) {
    if (order.orderedAt !== undefined) {
      events.push({
        kind: "orderPlaced",
        at: order.orderedAt,
        orderId: order.orderId,
        supplierName: order.supplierName,
        titleCount: order.titleCount,
      });
    }
    if (order.status === "ordered" && order.expectedAt !== undefined) {
      events.push({
        kind: "expectedDelivery",
        at: order.expectedAt,
        orderId: order.orderId,
        supplierName: order.supplierName,
        outstandingQuantity: order.outstandingQuantity,
      });
    }
  }

  for (const movement of inputs.movements) {
    events.push({
      kind: "movement",
      at: movement.createdAt,
      movementId: movement.movementId,
      movementKind: movement.movementKind,
      titleId: movement.titleId,
      titleName: movement.titleName,
      quantity: movement.quantity,
      ...(movement.reason === undefined
        ? {}
        : { reason: movement.reason }),
    });
  }

  for (const visit of inputs.visits) {
    events.push({
      kind: "visitOccurred",
      at: visit.occurredAt,
      visitId: visit.visitId,
      schoolName: visit.schoolName,
      donatedQuantity: visit.donatedQuantity,
    });
  }

  const inWindow = events
    .filter((event) => event.at >= window.from && event.at <= window.to)
    .sort((left, right) => right.at - left.at);

  return {
    events: inWindow.slice(0, TIMELINE_EVENT_CAP),
    truncated: inWindow.length > TIMELINE_EVENT_CAP,
  };
}
