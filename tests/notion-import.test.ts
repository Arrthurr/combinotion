import { describe, expect, it } from "vitest";
import { notionSourceId } from "@/lib/domain/intake";
import {
  dryRunImport,
  parseCountsCsv,
  parseImportRow,
  parseNotionExport,
  previewDigest,
  type ImportRow,
} from "@/lib/domain/notionImport";

const titleRow: ImportRow = {
  kind: "title",
  notionId: "title-1",
  title: "A Good Book",
  author: "Ann Author",
  isbn: "9780000000001",
};

const visitRow: ImportRow = {
  kind: "visit",
  notionId: "visit-1",
  schoolNotionId: "school-1",
  occurredAt: 1,
  staffNotionIds: [],
  readerNotionIds: ["person-1"],
  books: [{ isbn: "9780000000001", donatedQuantity: 4, readAloud: true }],
};

describe("Notion import", () => {
  it("reports invalid rows without treating them as writes", () => {
    const report = dryRunImport([
      titleRow,
      { ...titleRow, notionId: "title-2", isbn: "" },
      visitRow,
    ]);
    expect(report.validCount).toBe(2);
    expect(report.invalid).toEqual([
      {
        sourceId: notionSourceId("title", "title-2"),
        reason: "ISBN is required",
      },
    ]);
    expect(report.wouldWrite.map((row) => row.kind)).toEqual([
      "title",
      "visit",
    ]);
    expect(report.digest).toBe(previewDigest(report.wouldWrite));
  });

  it("treats a duplicate source id as invalid", () => {
    const report = dryRunImport([titleRow, titleRow]);
    expect(report.validCount).toBe(1);
    expect(report.invalid[0]?.reason).toContain("Duplicate source id");
  });

  it("parses a physical count into opening-balance rows", () => {
    expect(parseCountsCsv("isbn,quantity\n9780000000001,12\n")).toEqual([
      {
        kind: "openingBalance",
        isbn: "9780000000001",
        quantity: 12,
        reason: "Physical count",
      },
    ]);
  });

  it("rejects an export that is not a rows document", () => {
    expect(() => parseNotionExport([])).toThrow("rows");
  });

  it("rejects an unknown import kind", () => {
    expect(() => parseImportRow({ kind: "pipeline" }, 0)).toThrow("unknown kind");
  });
});
