export type Role =
  | "donor"
  | "professional"
  | "volunteer"
  | "schoolStaff"
  | "board"
  | "reader"
  | "reviewer";

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
