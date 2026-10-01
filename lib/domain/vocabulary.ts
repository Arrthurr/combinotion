import { v, type Infer, type Validator } from "convex/values";

// Shared literals own both the TypeScript vocabulary and runtime validators.
function literals<const T extends readonly [string, ...string[]]>(values: T) {
  return v.union(...values.map((value) => v.literal<T[number]>(value)));
}

export const ROLES = [
  "donor",
  "professional",
  "volunteer",
  "schoolStaff",
  "board",
  "reader",
  "reviewer",
] as const;
export const roleValidator = literals(ROLES);
export type Role = Infer<typeof roleValidator>;

export const MOVEMENT_KINDS = [
  "openingBalance",
  "receipt",
  "adjustment",
  "donation",
  "reservation",
  "release",
  "reservationConsumption",
] as const;
export const movementKindValidator = literals(MOVEMENT_KINDS);
export type MovementKind = Infer<typeof movementKindValidator>;

export const ORDER_STATUSES = ["needed", "ordered", "received"] as const;
export const orderStatusValidator = literals(ORDER_STATUSES);
export type OrderStatus = Infer<typeof orderStatusValidator>;

export const REQUEST_STATUSES = ["active", "cancelled", "declined", "fulfilled"] as const;
export const requestStatusValidator = literals(REQUEST_STATUSES);
export type RequestStatus = Infer<typeof requestStatusValidator>;

export const MATCH_STATUSES = ["attached", "unmatched", "ambiguous"] as const;
export const matchStatusValidator = literals(MATCH_STATUSES);
export type MatchStatus = Infer<typeof matchStatusValidator>;

export const VISIT_PERSON_KINDS = ["staff", "reader"] as const;
export const visitPersonKindValidator = literals(VISIT_PERSON_KINDS);
export type VisitPersonKind = Infer<typeof visitPersonKindValidator>;

export const CONSUMPTION_STATUSES = ["consumed", "none", "ambiguous"] as const;
export const consumptionStatusValidator = literals(CONSUMPTION_STATUSES);
export type ConsumptionStatus = Infer<typeof consumptionStatusValidator>;

export const VISIT_PLAN_STAGES = [
  "readerConfirmation",
  "schoolContact",
  "securingBooks",
] as const;
export const visitPlanStageValidator = literals(VISIT_PLAN_STAGES);
export type VisitPlanStage = Infer<typeof visitPlanStageValidator>;

// Domain projections use strings; persistence supplies v.id("visits").
export function visitPlanResolutionValidator<VisitId>(
  visitId: Validator<VisitId>,
) {
  return v.union(
    v.object({ kind: v.literal("visited"), visitId }),
    v.object({ kind: v.literal("archived") }),
  );
}
export type VisitPlanResolution<VisitId = string> = Infer<
  ReturnType<typeof visitPlanResolutionValidator<VisitId>>
>;

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
export const tableColumnValidator = literals(TABLE_COLUMNS);
export type TableColumn = Infer<typeof tableColumnValidator>;
