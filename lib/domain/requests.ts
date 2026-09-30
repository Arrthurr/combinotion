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
  const exact = schools.filter(
    (school) =>
      normalizedName !== "" && normalizedAddress !== "" &&
      school.normalizedName === normalizedName &&
      school.normalizedAddress === normalizedAddress,
  );
  if (exact.length === 1) {
    return { matchStatus: "attached", schoolId: exact[0].id };
  }

  const partial = schools.some(
    (school) =>
      (normalizedName !== "" && school.normalizedName === normalizedName) ||
      (normalizedAddress !== "" && school.normalizedAddress === normalizedAddress),
  );
  return partial
    ? { matchStatus: "ambiguous" }
    : { matchStatus: "unmatched" };
}
