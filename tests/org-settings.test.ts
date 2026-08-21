import { describe, expect, it } from "vitest";
import {
  assertPublicRequestsOpen,
  defaultOrgSettings,
  isPublicRequestsOpen,
  publicRequestsHoldMessage,
} from "@/lib/domain/orgSettings";

describe("org settings", () => {
  it("holds public requests closed until staff open them", () => {
    expect(defaultOrgSettings().publicRequests).toEqual({ kind: "paused" });
    expect(isPublicRequestsOpen(null)).toBe(false);
    expect(() => assertPublicRequestsOpen(null)).toThrow(
      "Public book requests are closed",
    );
  });

  it("uses a custom hold message when requests are paused", () => {
    expect(
      publicRequestsHoldMessage({
        kind: "paused",
        message: "Hold until the count is done",
      }),
    ).toBe("Hold until the count is done");
    expect(() =>
      assertPublicRequestsOpen({
        lowStockThreshold: 15,
        publicRequests: {
          kind: "paused",
          message: "Hold until the count is done",
        },
      }),
    ).toThrow("Hold until the count is done");
    expect(publicRequestsHoldMessage({ kind: "open" })).toBeUndefined();
  });
});
