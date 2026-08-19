import { describe, expect, it } from "vitest";
import { parseOpenLibraryBook } from "@/lib/domain/enrichment";

describe("Open Library ISBN enrichment", () => {
  it("maps a books API payload to editable catalog fields", () => {
    expect(
      parseOpenLibraryBook(
        {
          "ISBN:9780000000001": {
            title: " A Good Book ",
            authors: [{ name: "Ann Author" }, { name: "Bea Writer" }],
            cover: {
              small: "https://covers.example/small.jpg",
              medium: "https://covers.example/medium.jpg",
            },
            notes: { value: "A useful synopsis." },
          },
        },
        "9780000000001",
      ),
    ).toEqual({
      title: "A Good Book",
      author: "Ann Author, Bea Writer",
      coverUrl: "https://covers.example/medium.jpg",
      synopsis: "A useful synopsis.",
    });
  });

  it("returns null for an unknown ISBN or unusable book", () => {
    expect(parseOpenLibraryBook({}, "9780000000001")).toBeNull();
    expect(
      parseOpenLibraryBook(
        { "ISBN:9780000000001": { title: "  ", authors: [{}] } },
        "9780000000001",
      ),
    ).toBeNull();
    expect(parseOpenLibraryBook(null, "9780000000001")).toBeNull();
  });

  it("uses the first excerpt when notes are absent", () => {
    expect(
      parseOpenLibraryBook(
        {
          "ISBN:9780000000001": {
            excerpts: [{ text: " First excerpt. " }],
          },
        },
        "9780000000001",
      ),
    ).toEqual({ synopsis: "First excerpt." });
  });
});
