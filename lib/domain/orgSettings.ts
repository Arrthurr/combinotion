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

export function publicRequestsHoldMessage(publicRequests: PublicRequests) {
  switch (publicRequests.kind) {
    case "open":
      return undefined;
    case "paused":
      return publicRequests.message ?? "Public book requests are closed";
    default: {
      const unhandled: never = publicRequests;
      throw new Error(
        `Unhandled public request state: ${JSON.stringify(unhandled)}`,
      );
    }
  }
}

export function assertPublicRequestsOpen(settings: OrgSettings | null) {
  const current = settings ?? defaultOrgSettings();
  const message = publicRequestsHoldMessage(current.publicRequests);
  if (message !== undefined) {
    throw new Error(message);
  }
}

export function isPublicRequestsOpen(settings: OrgSettings | null) {
  return (settings ?? defaultOrgSettings()).publicRequests.kind === "open";
}

export function orgThreshold(settings: OrgSettings | null) {
  return (settings ?? defaultOrgSettings()).lowStockThreshold;
}
