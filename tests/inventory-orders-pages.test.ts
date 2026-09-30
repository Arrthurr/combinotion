import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import InventoryPage from "@/app/(staff)/inventory/page";
import OrdersPage from "@/app/(staff)/orders/page";

// Components read configuration at import time, before test hooks run.
vi.hoisted(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", ""));
afterAll(() => vi.unstubAllEnvs());

describe("inventory and orders pages", () => {
  it("renders labelled inventory fallback content without Convex", () => {
    const html = renderToStaticMarkup(createElement(InventoryPage));
    expect(html).toContain("<h1>Inventory</h1>");
    expect(html).toContain("Inventory review is not configured");
    expect(html).toContain("Connect Convex");
  });

  it("renders labelled supplier-order fallback content without Convex", () => {
    const html = renderToStaticMarkup(createElement(OrdersPage));
    expect(html).toContain("<h1>Supplier orders</h1>");
    expect(html).toContain("Supplier orders are not configured");
    expect(html).toContain("Connect Convex");
  });
});
