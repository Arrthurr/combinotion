import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  renderVisitRecapPdf,
  visitRecapFilename,
  visitRecapLines,
  type VisitRecapData,
} from "@/lib/exports/visit-recap";

const visit: VisitRecapData = {
  occurredAt: new Date("2026-08-19T12:00:00Z").getTime(),
  school: {
    name: "Joy School",
    address: "1 Main Street",
  },
  staffPresent: [{ name: "Sam Staff" }],
  readers: [{ name: "Rae Reader" }],
  booksRead: [{ title: "A Good Book", author: "Ann Author" }],
  booksDonated: [
    {
      title: "A Good Book",
      author: "Ann Author",
      donatedQuantity: 20,
    },
  ],
  followUp: "Send the classroom reading list.",
};

describe("visit recap", () => {
  it("projects required recap content without private person fields", () => {
    const source = {
      ...visit,
      staffPresent: [
        {
          name: "Sam Staff",
          email: "private@example.com",
          roles: ["volunteer"],
        },
      ],
    };
    const text = visitRecapLines(source)
      .flatMap((section) => [section.heading, ...section.lines])
      .join("\n");

    expect(text).toContain("Joy School");
    expect(text).toContain("1 Main Street");
    expect(text).toContain("August 19, 2026");
    expect(text).toContain("Sam Staff");
    expect(text).toContain("Rae Reader");
    expect(text).toContain("A Good Book by Ann Author");
    expect(text).toContain("20 copies");
    expect(text).toContain("Send the classroom reading list.");
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("volunteer");
  });

  it("uses explicit empty states", () => {
    const sections = visitRecapLines({
      ...visit,
      staffPresent: [],
      readers: [],
      booksRead: [],
      booksDonated: [],
      followUp: " ",
    });
    const lines = sections.flatMap((section) => section.lines);

    expect(lines).toEqual(
      expect.arrayContaining([
        "No staff recorded",
        "No readers recorded",
        "No books read aloud",
        "No books donated",
        "No follow-up recorded",
      ]),
    );
  });

  it("renders a loadable PDF and flows long recaps across pages", async () => {
    const books = Array.from({ length: 120 }, (_, index) => ({
      title: `Book ${index + 1}`,
      author: "Ann Author",
      donatedQuantity: index + 1,
    }));
    const bytes = await renderVisitRecapPdf({
      ...visit,
      booksRead: books,
      booksDonated: books,
    });
    const document = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("builds a stable filename from school and visit date", () => {
    expect(visitRecapFilename(visit)).toBe(
      "visit-recap-joy-school-2026-08-19.pdf",
    );
  });
});
