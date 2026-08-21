import { DEFAULT_LOW_STOCK_THRESHOLD } from "./inventory";

export type PublicRequests =
  | { kind: "open" }
  | { kind: "paused"; message?: string };

export type OrgSettings = {
  lowStockThreshold: number;
  publicRequests: PublicRequests;
};

export function defaultOrgSettings(): OrgSettings {
  return {
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    publicRequests: { kind: "paused" },
  };
}

export function assertPublicRequestsOpen(settings: OrgSettings | null) {
  const current = settings ?? defaultOrgSettings();
  if (current.publicRequests.kind === "paused") {
    throw new Error(
      current.publicRequests.message ?? "Public book requests are closed",
    );
  }
}

export function isPublicRequestsOpen(settings: OrgSettings | null) {
  return (settings ?? defaultOrgSettings()).publicRequests.kind === "open";
}

export function orgThreshold(settings: OrgSettings | null) {
  return (settings ?? defaultOrgSettings()).lowStockThreshold;
}
