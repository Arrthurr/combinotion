import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import NewTitlePage from "@/app/(staff)/books/new/page";

// Components read configuration at import time, before test hooks run.
vi.hoisted(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", ""));
afterAll(() => vi.unstubAllEnvs());

describe("new title page", () => {
  it("names the add-title heading and not a slug workspace", () => {
    const html = renderToStaticMarkup(createElement(NewTitlePage));
    expect(html).toContain("Add a title");
    expect(html).not.toContain("Title new");
    expect(html).toContain("Saving titles is not available yet.");
    expect(html).toContain("disabled");
  });
});
