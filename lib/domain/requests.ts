import type { MatchStatus } from "./types";

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
