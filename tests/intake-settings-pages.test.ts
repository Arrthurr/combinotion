import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IntakePage from "@/app/(staff)/intake/page";
import SettingsPage from "@/app/(staff)/settings/page";

describe("intake and settings pages", () => {
  it("renders labelled intake fallback content without Convex", () => {
    const html = renderToStaticMarkup(createElement(IntakePage));
    expect(html).toContain("<h1>Incoming forms</h1>");
    expect(html).toContain("Connect Convex to review incoming form rows.");
  });

  it("renders labelled settings fallback content without Convex", () => {
    const html = renderToStaticMarkup(createElement(SettingsPage));
    expect(html).toContain("<h1>Operations settings</h1>");
    expect(html).toContain("Connect Convex to change the threshold");
  });
});
