export const ROLES = [
  "donor",
  "professional",
  "volunteer",
  "schoolStaff",
  "board",
  "reader",
  "reviewer",
] as const;

export type Role = (typeof ROLES)[number];

export type Person = {
  name: string;
  email?: string;
  roles: Role[];
};

export type School = {
  name: string;
  normalizedName: string;
  address: string;
  normalizedAddress: string;
};

export type SchoolContact<SchoolId = string, PersonId = string> = {
  schoolId: SchoolId;
  personId: PersonId;
};

export type Visit<SchoolId = string> = {
  schoolId: SchoolId;
  occurredAt: number;
  followUp?: string;
  effectGeneration: number;
};

export type VisitPersonKind = "staff" | "reader";

export type VisitPerson<VisitId = string, PersonId = string> = {
  visitId: VisitId;
  personId: PersonId;
  kind: VisitPersonKind;
};

export type ConsumptionStatus = "consumed" | "none" | "ambiguous";

export type VisitBook<
  VisitId = string,
  TitleId = string,
  ReservationId = string,
> = {
  visitId: VisitId;
  titleId: TitleId;
  donatedQuantity: number;
  readAloud: boolean;
  consumptionStatus: ConsumptionStatus;
  consumedReservationId?: ReservationId;
  consumedQuantity: number;
};

export type MovementKind =
  | "openingBalance"
  | "receipt"
  | "adjustment"
  | "donation"
  | "reservation"
  | "release"
  | "reservationConsumption";

export type StockState = {
  quantityOnHand: number;
  activeReservedQuantity: number;
};

export type Movement = {
  id: string;
  kind: MovementKind;
  quantity: number;
  reason?: string;
  sourceId: string;
  createdAt: number;
};

export type OrderStatus = "needed" | "ordered" | "received";

export type OrderLineQuantities = {
  orderedQuantity: number;
  receivedQuantity: number;
};

export type RequestStatus = "active" | "cancelled" | "declined" | "fulfilled";

export type MatchStatus = "attached" | "unmatched" | "ambiguous";

export type RequestLine = {
  isbn: string;
  quantity: number;
};

export type InventoryReview = StockState & {
  availableQuantity: number;
  lowStock: boolean;
  shortage: boolean;
};

export type Title = StockState & {
  title: string;
  author: string;
  isbn: string;
  notes?: string;
  synopsis?: string;
  coverUrl?: string;
};
