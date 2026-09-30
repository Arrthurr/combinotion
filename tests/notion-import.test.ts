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
    expect(report.digest).toBe(previewDigest([titleRow, visitRow]));
  });

  it("treats a duplicate source id as invalid", () => {
    const report = dryRunImport([titleRow, titleRow]);
    expect(report.validCount).toBe(1);
    expect(report.invalid[0]?.reason).toContain("Duplicate source id");
  });

  it("invalidates the preview when a valid row's payload changes", () => {
    const first = dryRunImport([titleRow]);
    const edited = dryRunImport([{ ...titleRow, title: "A Better Book" }]);
    expect(first.wouldWrite).toEqual(edited.wouldWrite);
    expect(first.digest).not.toBe(edited.digest);
  });

  it("reports a review whose title is not in the batch", () => {
    const review: ImportRow = {
      kind: "review",
      notionId: "review-1",
      isbn: "9780000000001",
      reviewer: "Riley",
      score: 1,
      feedback: "Yes.",
    };
    const report = dryRunImport([review], {
      importedSourceIds: new Set(),
      titles: new Map(),
    });
    expect(report.validCount).toBe(0);
    expect(report.wouldWrite).toEqual([]);
    expect(report.invalid).toEqual([
      {
        sourceId: notionSourceId("review", "review-1"),
        reason: "Title not found for review review-1",
      },
    ]);
    expect(report.digest).toBe(previewDigest([review]));
  });

  it("reports a visit whose school is not in the batch", () => {
    const report = dryRunImport(
      [
        titleRow,
        {
          kind: "person",
          notionId: "person-1",
          name: "Rae Reader",
          roles: ["reader"],
        },
        visitRow,
      ],
      { importedSourceIds: new Set(), titles: new Map() },
    );
    expect(report.wouldWrite.map((row) => row.kind)).toEqual(["person", "title"]);
    expect(report.invalid).toEqual([
      {
        sourceId: notionSourceId("visit", "visit-1"),
        reason: "School not found for visit visit-1",
      },
    ]);
  });

  it("skips unresolved visit staff and keeps the visit when a reader resolves", () => {
    const report = dryRunImport(
      [
        titleRow,
        {
          kind: "school",
          notionId: "school-1",
          name: "Joy School",
          address: "1 Main Street",
        },
        {
          kind: "person",
          notionId: "person-1",
          name: "Rae Reader",
          roles: ["reader"],
        },
        {
          ...visitRow,
          staffNotionIds: ["missing-staff"],
        },
      ],
      { importedSourceIds: new Set(), titles: new Map() },
    );
    expect(report.invalid).toEqual([]);
    expect(report.wouldWrite.map((row) => row.kind)).toContain("visit");
    expect(report.skipped).toEqual([
      {
        sourceId: notionSourceId("visit", "visit-1"),
        reason: "Skipping unresolved staff missing-staff",
      },
    ]);
  });

  it("reports a visit when no reader resolves", () => {
    const report = dryRunImport(
      [
        titleRow,
        {
          kind: "school",
          notionId: "school-1",
          name: "Joy School",
          address: "1 Main Street",
        },
        visitRow,
      ],
      { importedSourceIds: new Set(), titles: new Map() },
    );
    expect(report.wouldWrite.map((row) => row.kind)).not.toContain("visit");
    expect(report.invalid).toEqual([
      {
        sourceId: notionSourceId("visit", "visit-1"),
        reason: "Person not found for visit visit-1",
      },
    ]);
  });

  it("reports reused titles and already-imported sources", () => {
    const alreadyImported = dryRunImport([titleRow], {
      importedSourceIds: new Set([notionSourceId("title", "title-1")]),
      titles: new Map([
        ["9780000000001", { quantityOnHand: 1, hasMovements: false }],
      ]),
    });
    expect(alreadyImported.wouldWrite).toEqual([]);
    expect(alreadyImported.reused).toEqual([
      { sourceId: notionSourceId("title", "title-1"), kind: "title" },
    ]);

    const matchingIsbn = dryRunImport([titleRow], {
      importedSourceIds: new Set(),
      titles: new Map([
        ["9780000000001", { quantityOnHand: 1, hasMovements: false }],
      ]),
    });
    expect(matchingIsbn.wouldWrite).toEqual([
      { sourceId: notionSourceId("title", "title-1"), kind: "title" },
    ]);
    expect(matchingIsbn.reused).toEqual([
      { sourceId: notionSourceId("title", "title-1"), kind: "title" },
    ]);
  });

  it("reports an opening balance when the title already has movements", () => {
    const opening: ImportRow = {
      kind: "openingBalance",
      isbn: "9780000000001",
      quantity: 12,
      reason: "Physical count",
    };
    const report = dryRunImport([opening], {
      importedSourceIds: new Set(),
      titles: new Map([
        ["9780000000001", { quantityOnHand: 3, hasMovements: true }],
      ]),
    });
    expect(report.wouldWrite).toEqual([]);
    expect(report.invalid).toEqual([
      {
        sourceId: "openingBalance:9780000000001",
        reason:
          "Opening balance can only be recorded when on-hand is zero and the title has no movements",
      },
    ]);
  });

  it("keeps the same digest when only catalog state changes what is blocked", () => {
    const review: ImportRow = {
      kind: "review",
      notionId: "review-1",
      isbn: "9780000000001",
      reviewer: "Riley",
      score: 1,
      feedback: "Yes.",
    };
    const blocked = dryRunImport([review], {
      importedSourceIds: new Set(),
      titles: new Map(),
    });
    const ready = dryRunImport([review], {
      importedSourceIds: new Set(),
      titles: new Map([
        ["9780000000001", { quantityOnHand: 0, hasMovements: false }],
      ]),
    });
    expect(blocked.digest).toBe(ready.digest);
    expect(blocked.wouldWrite).toEqual([]);
    expect(ready.wouldWrite).toEqual([
      { sourceId: notionSourceId("review", "review-1"), kind: "review" },
    ]);
  });

  it("produces the same preview for the same rows in any order", () => {
    const school: ImportRow = {
      kind: "school",
      notionId: "school-1",
      name: "Joy School",
      address: "1 Main Street",
    };
    const person: ImportRow = {
      kind: "person",
      notionId: "person-1",
      name: "Rae Reader",
      roles: ["reader"],
    };
    const shuffled = dryRunImport([visitRow, titleRow, school, person]);
    const canonical = dryRunImport([person, school, titleRow, visitRow]);
    expect(shuffled.digest).toBe(canonical.digest);
    expect(shuffled.wouldWrite).toEqual(canonical.wouldWrite);
  });

  it("parses a physical count into opening-balance rows", () => {
    expect(parseCountsCsv("isbn,quantity\n978-0000000001,12\n")).toEqual([
      {
        kind: "openingBalance",
        isbn: "9780000000001",
        quantity: 12,
        reason: "Physical count",
      },
    ]);
  });

  it("strips Notion markdown and hyphenated ISBNs on parse", () => {
    expect(
      parseImportRow({
        kind: "title",
        notionId: "title-3",
        title: "**Hands**",
        author:
          "[Aya Khalil](https://www.amazon.com/Aya-Khalil/e/B07XWRSCJX)",
        isbn: "978-0823456386",
      }),
    ).toEqual({
      kind: "title",
      notionId: "title-3",
      title: "Hands",
      author: "Aya Khalil",
      isbn: "9780823456386",
    });
  });

  it("rejects an export that is not a rows document", () => {
    expect(() => parseNotionExport([])).toThrow("rows");
  });

  it("rejects an unknown import kind", () => {
    expect(() => parseImportRow({ kind: "pipeline" }, 0)).toThrow("unknown kind");
  });
});
