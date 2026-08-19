import { describe, expect, it } from "vitest";
import {
  POPULARITY_COLUMNS,
  derivePopularity,
  popularityCsv,
  visiblePopularityRows,
  type PopularityRow,
} from "@/lib/domain/reports";

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
});
