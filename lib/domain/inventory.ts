import type { Movement, StockState } from "./types";

export const DEFAULT_LOW_STOCK_THRESHOLD = 15;

export const availableQuantity = ({
  quantityOnHand,
  activeReservedQuantity,
}: StockState) => Math.max(0, quantityOnHand - activeReservedQuantity);

export const isShortage = ({
  quantityOnHand,
  activeReservedQuantity,
}: StockState) => quantityOnHand < activeReservedQuantity;

export const isLowStock = (onHand: number, threshold: number) =>
  onHand < threshold;

export function reviewState(
  stock: StockState,
  threshold = DEFAULT_LOW_STOCK_THRESHOLD,
) {
  return {
    availableQuantity: availableQuantity(stock),
    lowStock: isLowStock(stock.quantityOnHand, threshold),
    shortage: isShortage(stock),
  };
}

export function applyMovement(
  state: StockState,
  movement: Movement,
): StockState {
  if (movement.kind === "adjustment") {
    if (!movement.reason?.trim()) {
      throw new Error("Adjustments require a reason");
    }
    if (!Number.isInteger(movement.quantity) || movement.quantity === 0) {
      throw new Error("Adjustment quantity must be a non-zero integer");
    }
  } else if (!Number.isInteger(movement.quantity) || movement.quantity <= 0) {
    throw new Error("Quantity must be a positive integer");
  }

  let nextState: StockState;
  switch (movement.kind) {
    case "receipt":
    case "openingBalance":
    case "adjustment":
      nextState = {
        ...state,
        quantityOnHand: state.quantityOnHand + movement.quantity,
      };
      break;
    case "donation":
      nextState = {
        ...state,
        quantityOnHand: state.quantityOnHand - movement.quantity,
      };
      break;
    case "reservation":
      nextState = {
        ...state,
        activeReservedQuantity:
          state.activeReservedQuantity + movement.quantity,
      };
      break;
    case "release":
    case "reservationConsumption":
      nextState = {
        ...state,
        activeReservedQuantity: Math.max(
          0,
          state.activeReservedQuantity - movement.quantity,
        ),
      };
      break;
    default: {
      const unhandledKind: never = movement.kind;
      throw new Error(`Unhandled movement kind: ${unhandledKind}`);
    }
  }

  if (nextState.quantityOnHand < 0) {
    throw new Error("Movement cannot reduce on-hand quantity below zero");
  }
  return nextState;
}

export function reverseMovement(
  state: StockState,
  movement: Movement,
): StockState {
  let opposite: Movement;
  switch (movement.kind) {
    case "receipt":
    case "openingBalance":
      opposite = { ...movement, kind: "donation" };
      break;
    case "adjustment":
      opposite = { ...movement, quantity: -movement.quantity };
      break;
    case "donation":
      opposite = { ...movement, kind: "receipt" };
      break;
    case "reservation":
      opposite = { ...movement, kind: "release" };
      break;
    case "release":
    case "reservationConsumption":
      opposite = { ...movement, kind: "reservation" };
      break;
    default: {
      const unhandledKind: never = movement.kind;
      throw new Error(`Unhandled movement kind: ${unhandledKind}`);
    }
  }
  return applyMovement(state, opposite);
}
