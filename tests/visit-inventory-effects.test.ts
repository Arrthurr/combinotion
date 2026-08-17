import { describe, expect, it } from "vitest";
import {
  donationSourceId,
  matchVisitReservation,
  reservationConsumptionSourceId,
} from "../lib/domain/visits";

describe("visit inventory effects", () => {
  it("does not consume when no active reservation matches", () => {
    expect(matchVisitReservation([], 4)).toEqual({
      consumptionStatus: "none",
      consumedQuantity: 0,
    });
  });

  it("consumes up to the donated quantity for one match", () => {
    expect(
      matchVisitReservation([{ reservationId: "reservation-1", quantity: 6 }], 4),
    ).toEqual({
      consumptionStatus: "consumed",
      reservationId: "reservation-1",
      consumedQuantity: 4,
    });
    expect(
      matchVisitReservation([{ reservationId: "reservation-1", quantity: 2 }], 4),
    ).toEqual({
      consumptionStatus: "consumed",
      reservationId: "reservation-1",
      consumedQuantity: 2,
    });
  });

  it("leaves every reservation unchanged when the match is ambiguous", () => {
    expect(
      matchVisitReservation(
        [
          { reservationId: "reservation-1", quantity: 6 },
          { reservationId: "reservation-2", quantity: 2 },
        ],
        4,
      ),
    ).toEqual({
      consumptionStatus: "ambiguous",
      consumedQuantity: 0,
    });
  });

  it("includes the visit effect generation in stable source IDs", () => {
    expect(donationSourceId("visit-1", "title-1", 2)).toBe(
      "donation:visit-1:title-1:2",
    );
    expect(
      reservationConsumptionSourceId("visit-1", "reservation-1", 2),
    ).toBe("reservationConsumption:visit-1:reservation-1:2");
  });
});
