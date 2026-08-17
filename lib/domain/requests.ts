import { applyMovement, availableQuantity } from "./inventory";
import type { MatchStatus, Movement, StockState } from "./types";

type MatchableSchool = {
  id: string;
  normalizedName: string;
  normalizedAddress: string;
};

type SchoolMatch =
  | { matchStatus: "attached"; schoolId: string }
  | { matchStatus: Exclude<MatchStatus, "attached">; schoolId?: never };

export const normalizeSchool = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

function reservationMovement(
  kind: "reservation" | "release",
  quantity: number,
): Movement {
  return {
    id: kind,
    kind,
    quantity,
    sourceId: kind,
    createdAt: 0,
  };
}

export function reserve(state: StockState, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Choose at least one copy");
  }
  if (quantity > availableQuantity(state)) {
    throw new Error("Those copies are no longer available");
  }
  return applyMovement(state, reservationMovement("reservation", quantity));
}

export function release(state: StockState, quantity: number) {
  return applyMovement(state, reservationMovement("release", quantity));
}

export function matchSchool({
  name,
  address,
  schools,
}: {
  name: string;
  address: string;
  schools: MatchableSchool[];
}): SchoolMatch {
  const normalizedName = normalizeSchool(name);
  const normalizedAddress = normalizeSchool(address);
  const exact = schools.find(
    (school) =>
      school.normalizedName === normalizedName &&
      school.normalizedAddress === normalizedAddress,
  );
  if (exact) {
    return { matchStatus: "attached", schoolId: exact.id };
  }

  const partial = schools.some(
    (school) =>
      school.normalizedName === normalizedName ||
      school.normalizedAddress === normalizedAddress,
  );
  return partial
    ? { matchStatus: "ambiguous" }
    : { matchStatus: "unmatched" };
}
