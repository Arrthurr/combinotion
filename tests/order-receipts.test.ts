import { describe, expect, it } from "vitest";
import {
  isFullyReceived,
  nextOrderStatus,
  outstandingQuantity,
} from "@/lib/domain/orders";

describe("order receipts", () => {
  it("calculates the quantity still outstanding", () => {
    expect(outstandingQuantity(10, 4)).toBe(6);
    expect(outstandingQuantity(10, 10)).toBe(0);
  });

  it("reports whether every line has been received", () => {
    expect(
      isFullyReceived([
        { orderedQuantity: 4, receivedQuantity: 4 },
        { orderedQuantity: 2, receivedQuantity: 1 },
      ]),
    ).toBe(false);
    expect(
      isFullyReceived([
        { orderedQuantity: 4, receivedQuantity: 4 },
        { orderedQuantity: 2, receivedQuantity: 2 },
      ]),
    ).toBe(true);
  });

  it("moves a needed order to ordered after a partial receipt", () => {
    expect(
      nextOrderStatus("needed", [
        { orderedQuantity: 4, receivedQuantity: 1 },
      ]),
    ).toBe("ordered");
  });

  it("moves an order to received when every line is complete", () => {
    expect(
      nextOrderStatus("ordered", [
        { orderedQuantity: 4, receivedQuantity: 4 },
        { orderedQuantity: 2, receivedQuantity: 2 },
      ]),
    ).toBe("received");
  });
});
