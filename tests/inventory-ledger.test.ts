import { describe, expect, it } from "vitest";
import {
  applyMovement,
  availableQuantity,
  isLowStock,
  isShortage,
  reviewState,
} from "@/lib/domain/inventory";
import type { Movement, MovementKind } from "@/lib/domain/types";

const movement = (
  kind: MovementKind,
  quantity: number,
  reason?: string,
): Movement => ({
  id: "movement",
  kind,
  quantity,
  reason,
  sourceId: "source",
  createdAt: 0,
});

describe("inventory ledger", () => {
  it("adds receipts to on-hand quantity", () => {
    expect(
      applyMovement(
        { quantityOnHand: 2, activeReservedQuantity: 0 },
        movement("receipt", 3),
      ),
    ).toEqual({ quantityOnHand: 5, activeReservedQuantity: 0 });
  });

  it("applies a signed adjustment from 25 to 23", () => {
    expect(
      applyMovement(
        { quantityOnHand: 25, activeReservedQuantity: 0 },
        movement("adjustment", -2, "Physical count"),
      ).quantityOnHand,
    ).toBe(23);
  });

  it("rejects an adjustment without a reason", () => {
    expect(() =>
      applyMovement(
        { quantityOnHand: 2, activeReservedQuantity: 0 },
        movement("adjustment", 1),
      ),
    ).toThrow("reason");
  });

  it.each([0, 1.5])("rejects adjustment quantity %s", (quantity) => {
    expect(() =>
      applyMovement(
        { quantityOnHand: 2, activeReservedQuantity: 0 },
        movement("adjustment", quantity, "Count"),
      ),
    ).toThrow("non-zero integer");
  });

  it("flags 14 copies as low stock at the default threshold", () => {
    expect(isLowStock(14, 15)).toBe(true);
    expect(
      reviewState({
        quantityOnHand: 14,
        activeReservedQuantity: 0,
      }).lowStock,
    ).toBe(true);
  });

  it("identifies a reservation shortage", () => {
    const stock = { quantityOnHand: 4, activeReservedQuantity: 6 };
    expect(isShortage(stock)).toBe(true);
    expect(reviewState(stock).shortage).toBe(true);
  });

  it("reports zero availability during a shortage", () => {
    const stock = { quantityOnHand: 4, activeReservedQuantity: 6 };
    expect(availableQuantity(stock)).toBe(0);
    expect(reviewState(stock).availableQuantity).toBe(0);
  });
});
