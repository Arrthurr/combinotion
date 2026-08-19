import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TitlePage from "@/app/(staff)/books/[titleId]/page";

describe("title workspace page", () => {
  it("renders labelled workspace fallback without Convex", async () => {
    const html = renderToStaticMarkup(
      await TitlePage({ params: Promise.resolve({ titleId: "title_test" }) }),
    );
    expect(html).toContain("<h1>Title workspace</h1>");
    expect(html).toContain("Inventory");
    expect(html).toContain("Requests and visits");
    expect(html).toContain("Reviews");
    expect(html).toContain("Suppliers and orders");
  });
});
