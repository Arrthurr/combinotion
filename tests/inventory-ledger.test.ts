import { describe, expect, it } from "vitest";
import {
  availableQuantity,
  isLowStock,
  isShortage,
  reviewState,
} from "@/lib/domain/inventory";

describe("inventory ledger", () => {
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
