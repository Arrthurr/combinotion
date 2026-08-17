import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InventoryPage from "@/app/(staff)/inventory/page";
import OrdersPage from "@/app/(staff)/orders/page";

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
