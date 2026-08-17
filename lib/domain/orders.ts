import type { OrderLineQuantities, OrderStatus } from "./types";

export function outstandingQuantity(ordered: number, received: number) {
  return Math.max(0, ordered - received);
}

export function isFullyReceived(lines: OrderLineQuantities[]) {
  return lines.every(
    ({ orderedQuantity, receivedQuantity }) =>
      receivedQuantity >= orderedQuantity,
  );
}

export function nextOrderStatus(
  current: OrderStatus,
  lines: OrderLineQuantities[],
): OrderStatus {
  if (isFullyReceived(lines)) {
    return "received";
  }

  switch (current) {
    case "needed":
      return lines.some(({ receivedQuantity }) => receivedQuantity > 0)
        ? "ordered"
        : "needed";
    case "ordered":
      return "ordered";
    case "received":
      return "received";
    default: {
      const unhandledStatus: never = current;
      throw new Error(`Unhandled order status: ${unhandledStatus}`);
    }
  }
}
