import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NewTitlePage from "@/app/(staff)/books/new/page";

describe("new title page", () => {
  it("names the add-title heading and not a slug workspace", () => {
    const html = renderToStaticMarkup(createElement(NewTitlePage));
    expect(html).toContain("Add a title");
    expect(html).not.toContain("Title new");
    expect(html).toContain("Saving titles is not available yet.");
    expect(html).toContain("disabled");
  });
});
