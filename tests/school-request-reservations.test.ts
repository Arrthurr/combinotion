import { describe, expect, it } from "vitest";
import { matchSchool, normalizeSchool } from "@/lib/domain/requests";

const schools = [
  {
    id: "school_1",
    normalizedName: "joy school",
    normalizedAddress: "1 main street",
  },
];

describe("reservations", () => {
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
