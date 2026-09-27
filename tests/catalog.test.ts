import { describe, expect, it } from "vitest";
import {
  catalogText,
  normalizeIsbn,
  stripNotionMarkdown,
} from "@/lib/domain/catalog";

describe("catalog cleanup", () => {
  it("turns Notion markdown author links into plain names", () => {
    expect(
      stripNotionMarkdown(
        "[Aya Khalil](https://www.amazon.com/Aya-Khalil/e/B07XWRSCJX/ref=dp_byline_cont_book_1)",
      ),
    ).toBe("Aya Khalil");
    expect(
      stripNotionMarkdown(
        "[Erica Lee Schlaikjer](https://www.amazon.com/Erica-Lee-Schlaikjer/e/B0D6V288LC/ref=dp_byline_cont_book_1)",
      ),
    ).toBe("Erica Lee Schlaikjer");
    expect(
      stripNotionMarkdown(
        "[**Ada Reviewer**](https://example.org/ada)",
      ),
    ).toBe("Ada Reviewer");
  });

  it("strips leftover emphasis and images from catalog copy", () => {
    expect(
      catalogText(
        "A **classroom** favorite. See [the publisher](https://example.org) ~~old~~.",
      ),
    ).toBe("A classroom favorite. See the publisher old.");
    expect(catalogText("![cover](https://example.org/cover.jpg) Notes")).toBe(
      "cover Notes",
    );
  });

  it("normalizes hyphenated, spaced, and en-dash ISBNs to the same identity", () => {
    expect(normalizeIsbn("978-0823456386")).toBe("9780823456386");
    expect(normalizeIsbn("9781534111837")).toBe("9781534111837");
    expect(normalizeIsbn("978 0 593 375416")).toBe("9780593375416");
    expect(normalizeIsbn("978–0823456386")).toBe("9780823456386");
    expect(normalizeIsbn("0-306-40615-x")).toBe("030640615X");
  });

  it("treats punctuation-only ISBN text as empty", () => {
    expect(normalizeIsbn("ISBN: ---")).toBe("");
  });
});
