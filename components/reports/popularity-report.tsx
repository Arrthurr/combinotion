"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  POPULARITY_COLUMNS,
  formatAverageScore,
  popularityCsv,
  visiblePopularityRows,
  type PopularityColumnKey,
  type PopularityRow,
  type PopularityView,
  type SortDirection,
} from "@/lib/domain/reports";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type NumericColumn = Exclude<PopularityColumnKey, "title" | "author">;

const initialView: PopularityView = {
  filter: {},
  sort: {
    column: "requestCount",
    direction: "desc",
  },
};

function PopularityReportFallback() {
  return (
    <section
      className="card stack"
      aria-labelledby="popularity-report-heading"
    >
      <h2 id="popularity-report-heading">Book popularity report</h2>
      <label>
        Filter by title or author
        <input disabled type="search" />
      </label>
      <button className="button" disabled>
        Export visible rows as CSV
      </button>
      <p className="muted" role="status">
        Connect Convex to load popularity data.
      </p>
    </section>
  );
}

export function PopularityReport() {
  if (!convexConfigured) {
    return <PopularityReportFallback />;
  }
  return <PopularityReportLive />;
}

function sortAriaValue(
  column: PopularityColumnKey,
  view: PopularityView,
): "none" | "ascending" | "descending" {
  if (column !== view.sort.column) {
    return "none";
  }
  return view.sort.direction === "asc"
    ? "ascending"
    : "descending";
}

function cellValue<TitleId>(
  row: PopularityRow<TitleId>,
  column: PopularityColumnKey,
) {
  switch (column) {
    case "title":
      return row.title;
    case "author":
      return row.author;
    case "requestCount":
      return row.requestCount;
    case "donatedQuantity":
      return row.donatedQuantity;
    case "averageScore":
      return formatAverageScore(row.averageScore) || "No reviews";
    default: {
      const exhaustive: never = column;
      return exhaustive;
    }
  }
}

function PopularityReportLive() {
  const rows = useQuery(api.reports.popularity);
  const [view, setView] = useState<PopularityView>(initialView);
  const visible = useMemo(
    () => visiblePopularityRows(rows ?? [], view),
    [rows, view],
  );

  function setSort(
    column: PopularityColumnKey,
    defaultDirection: SortDirection,
  ) {
    setView((current) => ({
      ...current,
      sort: {
        column,
        direction:
          current.sort.column === column
            ? current.sort.direction === "asc"
              ? "desc"
              : "asc"
            : defaultDirection,
      },
    }));
  }

  function setMinimum(column: NumericColumn, rawValue: string) {
    const value = rawValue === "" ? undefined : Number(rawValue);
    setView((current) => ({
      ...current,
      filter: {
        ...current.filter,
        min: {
          ...current.filter.min,
          [column]: value,
        },
      },
    }));
  }

  function downloadCsv() {
    const url = URL.createObjectURL(
      new Blob([popularityCsv(visible)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "book-popularity.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="card stack"
      aria-labelledby="popularity-report-heading"
    >
      <h2 id="popularity-report-heading">Book popularity report</h2>
      <div className="row">
        <label>
          Filter by title or author
          <input
            type="search"
            value={view.filter.text ?? ""}
            onChange={(event) =>
              setView((current) => ({
                ...current,
                filter: {
                  ...current.filter,
                  text: event.target.value,
                },
              }))
            }
          />
        </label>
        <label>
          Minimum requests
          <input
            min="0"
            step="1"
            type="number"
            value={view.filter.min?.requestCount ?? ""}
            onChange={(event) =>
              setMinimum("requestCount", event.target.value)
            }
          />
        </label>
        <label>
          Minimum donated copies
          <input
            min="0"
            step="1"
            type="number"
            value={view.filter.min?.donatedQuantity ?? ""}
            onChange={(event) =>
              setMinimum("donatedQuantity", event.target.value)
            }
          />
        </label>
        <label>
          Minimum average rubric score
          <input
            min="0"
            step="0.1"
            type="number"
            value={view.filter.min?.averageScore ?? ""}
            onChange={(event) =>
              setMinimum("averageScore", event.target.value)
            }
          />
        </label>
      </div>
      <div className="row">
        <button
          className="button"
          disabled={rows === undefined}
          type="button"
          onClick={downloadCsv}
        >
          Export visible rows as CSV
        </button>
        <p className="muted" role="status" aria-live="polite">
          {rows === undefined
            ? "Loading popularity report…"
            : `${visible.length} of ${rows.length} titles shown`}
        </p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table aria-label="Book popularity report" style={{ width: "100%" }}>
          <thead>
            <tr>
              {POPULARITY_COLUMNS.map((column) => (
                <th
                  aria-sort={sortAriaValue(column.key, view)}
                  key={column.key}
                  scope="col"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort(column.key, column.defaultDirection)
                    }
                  >
                    {column.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={POPULARITY_COLUMNS.length}>
                  {rows === undefined
                    ? "Loading titles…"
                    : "No titles match these filters."}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.titleId}>
                  {POPULARITY_COLUMNS.map((column) => (
                    <td key={column.key}>{cellValue(row, column.key)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
