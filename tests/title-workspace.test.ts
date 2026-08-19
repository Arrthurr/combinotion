import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  DEFAULT_TABLE_COLUMNS,
  sanitizeTableColumns,
  stageNeighbors,
  TIMELINE_EVENT_CAP,
} from "@/lib/domain/views";

describe("title workspace domain views", () => {
  it("sanitizes persisted columns without losing their order", () => {
    expect(
      sanitizeTableColumns([
        "isbn",
        "retiredColumn",
        "notes",
        "isbn",
        "quantityOnHand",
      ]),
    ).toEqual(["isbn", "notes", "quantityOnHand"]);
    expect(DEFAULT_TABLE_COLUMNS).toEqual([
      "author",
      "isbn",
      "quantityOnHand",
      "availableQuantity",
      "reorderNeeded",
    ]);
  });

  it("returns the valid neighboring visit-plan stages", () => {
    expect(stageNeighbors("readerConfirmation")).toEqual({
      next: "schoolContact",
    });
    expect(stageNeighbors("schoolContact")).toEqual({
      previous: "readerConfirmation",
      next: "securingBooks",
    });
    expect(stageNeighbors("securingBooks")).toEqual({
      previous: "schoolContact",
    });
  });

  it("builds a descending timeline inside the requested window", () => {
    const timeline = buildTimeline(
      {
        orders: [
          {
            orderId: "order-1",
            supplierName: "Supplier",
            status: "ordered",
            orderedAt: 20,
            expectedAt: 50,
            titleCount: 2,
            outstandingQuantity: 7,
          },
          {
            orderId: "order-2",
            supplierName: "Supplier",
            status: "needed",
            expectedAt: 45,
            titleCount: 1,
            outstandingQuantity: 1,
          },
        ],
        movements: [
          {
            movementId: "movement-1",
            movementKind: "receipt",
            createdAt: 30,
            titleId: "title-1",
            titleName: "Book",
            quantity: 3,
          },
          {
            movementId: "movement-outside",
            movementKind: "adjustment",
            createdAt: 5,
            titleId: "title-1",
            titleName: "Book",
            quantity: 1,
            reason: "Count",
          },
        ],
        visits: [
          {
            visitId: "visit-1",
            schoolName: "Joy School",
            occurredAt: 40,
            donatedQuantity: 4,
          },
        ],
      },
      { from: 10, to: 50 },
    );

    expect(timeline.truncated).toBe(false);
    expect(timeline.events.map((event) => event.kind)).toEqual([
      "expectedDelivery",
      "visitOccurred",
      "movement",
      "orderPlaced",
    ]);
    expect(timeline.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderId: "order-2" }),
        expect.objectContaining({ movementId: "movement-outside" }),
      ]),
    );
  });

  it("reports when the event cap drops older history", () => {
    const timeline = buildTimeline(
      {
        orders: [],
        visits: [],
        movements: Array.from(
          { length: TIMELINE_EVENT_CAP + 1 },
          (_, index) => ({
            movementId: `movement-${index}`,
            movementKind: "receipt" as const,
            createdAt: index,
            titleId: "title-1",
            titleName: "Book",
            quantity: 1,
          }),
        ),
      },
      { from: 0, to: TIMELINE_EVENT_CAP },
    );

    expect(timeline.truncated).toBe(true);
    expect(timeline.events).toHaveLength(TIMELINE_EVENT_CAP);
    expect(timeline.events[0]).toEqual(
      expect.objectContaining({ at: TIMELINE_EVENT_CAP }),
    );
  });
});
