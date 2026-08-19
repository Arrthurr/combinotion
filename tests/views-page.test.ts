import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ViewsPage from "@/app/(staff)/views/page";

describe("operations views page", () => {
  it("renders labelled view fallbacks without Convex", () => {
    const html = renderToStaticMarkup(createElement(ViewsPage));
    expect(html).toContain("<h1>Operations views</h1>");
    expect(html).toContain("Table");
    expect(html).toContain("Visit board");
    expect(html).toContain("Timeline");
    expect(html).toContain("Connect Convex to load titles.");
  });
});
