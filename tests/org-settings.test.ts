import { describe, expect, it } from "vitest";
import {
  assertPublicRequestsOpen,
  defaultOrgSettings,
  isPublicRequestsOpen,
} from "@/lib/domain/orgSettings";

describe("org settings", () => {
  it("holds public requests closed until staff open them", () => {
    expect(defaultOrgSettings().publicRequests).toEqual({ kind: "paused" });
    expect(isPublicRequestsOpen(null)).toBe(false);
    expect(() => assertPublicRequestsOpen(null)).toThrow(
      "Public book requests are closed",
    );
  });
});
