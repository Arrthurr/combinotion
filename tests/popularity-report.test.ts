import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  POPULARITY_COLUMNS,
  derivePopularity,
  popularityCsv,
  visiblePopularityRows,
  type PopularityRow,
} from "@/lib/domain/reports";
import {
  popularityPdfFilename,
  popularityPdfSummary,
  renderPopularityReportPdf,
} from "@/lib/exports/popularity-report";

function pdfShownText(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString("latin1");
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((match) => {
      try {
        return inflateSync(Buffer.from(match[1] ?? "", "latin1")).toString(
          "latin1",
        );
      } catch {
        return "";
      }
    })
    .flatMap((content) =>
      [...content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((match) =>
        Buffer.from(match[1] ?? "", "hex").toString("latin1"),
      ),
    )
    .join("\n");
}

const rows: PopularityRow[] = [
  {
    titleId: "alpha",
    title: "Alpha",
    author: "Zed",
    requestCount: 2,
    donatedQuantity: 4,
    averageScore: 3,
  },
  {
    titleId: "beta",
    title: "Beta",
    author: "Ann",
    requestCount: 5,
    donatedQuantity: 1,
    averageScore: 4.25,
  },
  {
    titleId: "gamma",
    title: "Gamma",
    author: "Bea",
    requestCount: 1,
    donatedQuantity: 8,
    averageScore: null,
  },
];

describe("book popularity", () => {
  it("derives canonical metrics without active or approval semantics", () => {
    const reservations = [
      { titleId: "alpha", schoolRequestId: "request-1", active: true },
      { titleId: "alpha", schoolRequestId: "request-1", active: false },
      { titleId: "alpha", schoolRequestId: "request-2", active: false },
      { titleId: "beta", schoolRequestId: "request-1", active: true },
    ];
    const result = derivePopularity({
      titles: [
        { titleId: "alpha", title: "Alpha", author: "Ann" },
        { titleId: "beta", title: "Beta", author: "Bea" },
        { titleId: "empty", title: "Empty", author: "Eli" },
      ],
      reservations,
      visitBooks: [
        { titleId: "alpha", donatedQuantity: 2 },
        { titleId: "alpha", donatedQuantity: 3 },
        { titleId: "beta", donatedQuantity: 1 },
      ],
      reviews: [
        { titleId: "alpha", score: 2 },
        { titleId: "alpha", score: 4 },
        { titleId: "beta", score: 5 },
      ],
    });

    expect(result).toEqual([
      {
        titleId: "alpha",
        title: "Alpha",
        author: "Ann",
        requestCount: 2,
        donatedQuantity: 5,
        averageScore: 3,
      },
      {
        titleId: "beta",
        title: "Beta",
        author: "Bea",
        requestCount: 1,
        donatedQuantity: 1,
        averageScore: 5,
      },
      {
        titleId: "empty",
        title: "Empty",
        author: "Eli",
        requestCount: 0,
        donatedQuantity: 0,
        averageScore: null,
      },
    ]);
  });

  it("lists a reviewed work that is not in inventory", () => {
    const result = derivePopularity({
      titles: [{ titleId: "owned", title: "Owned", author: "Ann" }],
      reservations: [],
      visitBooks: [],
      reviews: [{ titleText: "A Book We Should Buy", score: 5 }],
    });

    expect(result).toEqual([
      {
        titleId: "reviewed:a book we should buy",
        title: "A Book We Should Buy",
        author: "",
        requestCount: 0,
        donatedQuantity: 0,
        averageScore: 5,
      },
      {
        titleId: "owned",
        title: "Owned",
        author: "Ann",
        requestCount: 0,
        donatedQuantity: 0,
        averageScore: null,
      },
    ]);
  });

  it("filters independent metrics and preserves every column", () => {
    const visible = visiblePopularityRows(rows, {
      filter: {
        text: "a",
        min: { requestCount: 2, donatedQuantity: 1, averageScore: 3.5 },
      },
      sort: { column: "requestCount", direction: "desc" },
    });

    expect(visible).toEqual([rows[1]]);
    expect(visible[0]).toEqual(
      expect.objectContaining({
        requestCount: 5,
        donatedQuantity: 1,
        averageScore: 4.25,
      }),
    );
  });

  it.each([
    ["requestCount", "Beta"],
    ["donatedQuantity", "Gamma"],
    ["averageScore", "Beta"],
  ] as const)("sorts %s independently", (column, firstTitle) => {
    const visible = visiblePopularityRows(rows, {
      filter: {},
      sort: { column, direction: "desc" },
    });

    expect(visible[0]?.title).toBe(firstTitle);
    expect(visible.every((row) => "requestCount" in row)).toBe(true);
    expect(visible.every((row) => "donatedQuantity" in row)).toBe(true);
    expect(visible.every((row) => "averageScore" in row)).toBe(true);
  });

  it("sorts missing scores last in both directions and breaks ties by title", () => {
    const tiedRows = [
      rows[2],
      rows[1],
      { ...rows[0], averageScore: rows[1]?.averageScore ?? null },
    ];

    expect(
      visiblePopularityRows(tiedRows, {
        filter: {},
        sort: { column: "averageScore", direction: "asc" },
      }).map((row) => row.title),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(
      visiblePopularityRows(tiedRows, {
        filter: {},
        sort: { column: "averageScore", direction: "desc" },
      }).map((row) => row.title),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("exports exactly the supplied visible rows with shared headers", () => {
    const visible = visiblePopularityRows(rows, {
      filter: { min: { donatedQuantity: 4 } },
      sort: { column: "donatedQuantity", direction: "desc" },
    });

    expect(POPULARITY_COLUMNS.map((column) => column.label)).toEqual([
      "Title",
      "Author",
      "Requests",
      "Donated copies",
      "Average rubric score",
    ]);
    expect(popularityCsv(visible)).toBe(
      [
        '"Title","Author","Requests","Donated copies","Average rubric score"',
        '"Gamma","Bea","1","8",""',
        '"Alpha","Zed","2","4","3"',
      ].join("\n"),
    );
  });

  it("summarizes the current sort and filters for a shareable PDF", () => {
    expect(
      popularityPdfSummary(
        {
          filter: {
            text: "joy",
            min: { donatedQuantity: 4, averageScore: 3 },
          },
          sort: { column: "donatedQuantity", direction: "desc" },
        },
        2,
      ),
    ).toEqual([
      "Sorted by Donated copies, descending",
      "Filters: Title or author contains “joy”; Minimum donated copies: 4; Minimum average rubric score: 3",
      "2 titles",
    ]);
    expect(
      popularityPdfSummary(
        { filter: {}, sort: { column: "title", direction: "asc" } },
        1,
      ),
    ).toEqual(["Sorted by Title, ascending", "No filters applied", "1 title"]);
  });

  it("renders a loadable PDF of the supplied visible rows and paginates long reports", async () => {
    const visible = visiblePopularityRows(rows, {
      filter: { min: { donatedQuantity: 4 } },
      sort: { column: "donatedQuantity", direction: "desc" },
    });
    const bytes = await renderPopularityReportPdf({
      rows: visible,
      view: {
        filter: { min: { donatedQuantity: 4 } },
        sort: { column: "donatedQuantity", direction: "desc" },
      },
      generatedAt: Date.UTC(2026, 8, 28),
    });
    const document = await PDFDocument.load(bytes);

    const pageText = pdfShownText(bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    expect(document.getTitle()).toBe("Book popularity report");
    expect(document.getPageCount()).toBe(1);
    expect(pageText).toContain("Sorted by Donated copies, descending");
    expect(pageText).toContain("Minimum donated copies: 4");
    expect(pageText).toContain("Gamma");
    expect(pageText).toContain("Alpha");
    expect(pageText).not.toContain("Beta");
    expect(pageText).toContain("No reviews");
    expect(popularityPdfFilename).toBe("book-popularity.pdf");

    const manyRows = Array.from({ length: 80 }, (_, index) => ({
      titleId: `title-${index}`,
      title: `Title ${index + 1} that needs wrapping in the shareable table`,
      author: `Author ${index + 1}`,
      requestCount: index,
      donatedQuantity: index * 2,
      averageScore: index % 3 === 0 ? null : index / 10,
    }));
    const longBytes = await renderPopularityReportPdf({
      rows: manyRows,
      view: {
        filter: {},
        sort: { column: "requestCount", direction: "desc" },
      },
    });
    const longDocument = await PDFDocument.load(longBytes);
    expect(longDocument.getPageCount()).toBeGreaterThan(1);
    expect(longBytes.byteLength).toBeGreaterThan(1_000);
  });
});
