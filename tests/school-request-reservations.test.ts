import { describe, expect, it } from "vitest";
import {
  matchSchool,
  normalizeSchool,
  release,
  reserve,
} from "@/lib/domain/requests";

const schools = [
  {
    id: "school_1",
    normalizedName: "joy school",
    normalizedAddress: "1 main street",
  },
];

describe("reservations", () => {
  it("reserves through the stock reducer without depleting on-hand", () => {
    expect(
      reserve({ quantityOnHand: 10, activeReservedQuantity: 0 }, 6),
    ).toEqual({
      quantityOnHand: 10,
      activeReservedQuantity: 6,
    });
  });

  it("does not over-reserve and releases through the stock reducer", () => {
    expect(() =>
      reserve({ quantityOnHand: 3, activeReservedQuantity: 2 }, 2),
    ).toThrow("no longer");
    expect(
      release({ quantityOnHand: 3, activeReservedQuantity: 2 }, 2),
    ).toEqual({
      quantityOnHand: 3,
      activeReservedQuantity: 0,
    });
  });

  it("normalizes school matching values", () => {
    expect(normalizeSchool("  Joy   School ")).toBe("joy school");
  });

  it("attaches an exact normalized school match", () => {
    expect(
      matchSchool({
        name: " Joy School ",
        address: "1   MAIN STREET",
        schools,
      }),
    ).toEqual({ matchStatus: "attached", schoolId: "school_1" });
  });

  it("leaves a school unmatched when neither field matches", () => {
    expect(
      matchSchool({
        name: "Other School",
        address: "2 Side Street",
        schools,
      }),
    ).toEqual({ matchStatus: "unmatched" });
  });

  it.each([
    { name: "Joy School", address: "2 Side Street" },
    { name: "Other School", address: "1 Main Street" },
  ])("marks a name-only or address-only match ambiguous", ({ name, address }) => {
    expect(matchSchool({ name, address, schools })).toEqual({
      matchStatus: "ambiguous",
    });
  });
});
