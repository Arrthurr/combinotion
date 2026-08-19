"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { InventoryReview } from "@/lib/domain/types";
import {
  TABLE_COLUMNS,
  type TableColumn,
} from "@/lib/domain/views";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type ReviewRow = Doc<"titles"> & InventoryReview;

type DraftTitle = {
  title: string;
  author: string;
  isbn: string;
  synopsis: string;
  notes: string;
  purchaseInfo: string;
};

const emptyDraft: DraftTitle = {
  title: "",
  author: "",
  isbn: "",
  synopsis: "",
  notes: "",
  purchaseInfo: "",
};

function columnLabel(column: TableColumn) {
  switch (column) {
    case "author":
      return "Author";
    case "isbn":
      return "ISBN";
    case "quantityOnHand":
      return "On hand";
    case "activeReservedQuantity":
      return "Reserved";
    case "availableQuantity":
      return "Available";
    case "lowStock":
      return "Low stock";
    case "shortage":
      return "Shortage";
    case "reorderNeeded":
      return "Reorder needed";
    case "synopsis":
      return "Synopsis";
    case "notes":
      return "Notes";
    case "purchaseInfo":
      return "Purchase info";
    default: {
      const unhandledColumn: never = column;
      throw new Error(`Unhandled table column: ${unhandledColumn}`);
    }
  }
}

function flagText(on: boolean) {
  return on ? "Yes" : "No";
}

function isStockColumn(column: TableColumn) {
  switch (column) {
    case "quantityOnHand":
    case "activeReservedQuantity":
    case "availableQuantity":
    case "lowStock":
    case "shortage":
    case "reorderNeeded":
      return true;
    case "author":
    case "isbn":
    case "synopsis":
    case "notes":
    case "purchaseInfo":
      return false;
    default: {
      const unhandledColumn: never = column;
      throw new Error(`Unhandled table column: ${unhandledColumn}`);
    }
  }
}

function readCell(row: ReviewRow, column: TableColumn) {
  switch (column) {
    case "author":
      return row.author;
    case "isbn":
      return row.isbn;
    case "quantityOnHand":
      return String(row.quantityOnHand);
    case "activeReservedQuantity":
      return String(row.activeReservedQuantity);
    case "availableQuantity":
      return String(row.availableQuantity);
    case "lowStock":
      return flagText(row.lowStock);
    case "shortage":
      return flagText(row.shortage);
    case "reorderNeeded":
      return flagText(row.reorderNeeded);
    case "synopsis":
      return row.synopsis ?? "";
    case "notes":
      return row.notes ?? "";
    case "purchaseInfo":
      return row.purchaseInfo ?? "";
    default: {
      const unhandledColumn: never = column;
      throw new Error(`Unhandled table column: ${unhandledColumn}`);
    }
  }
}

function draftField(column: TableColumn): keyof DraftTitle | undefined {
  switch (column) {
    case "author":
      return "author";
    case "isbn":
      return "isbn";
    case "synopsis":
      return "synopsis";
    case "notes":
      return "notes";
    case "purchaseInfo":
      return "purchaseInfo";
    case "quantityOnHand":
    case "activeReservedQuantity":
    case "availableQuantity":
    case "lowStock":
    case "shortage":
    case "reorderNeeded":
      return undefined;
    default: {
      const unhandledColumn: never = column;
      throw new Error(`Unhandled table column: ${unhandledColumn}`);
    }
  }
}

function TableViewFallback() {
  return (
    <section className="card stack" aria-labelledby="table-view-heading">
      <h2 id="table-view-heading">Table</h2>
      <p>Choose columns for custom review. Connect Convex to load titles.</p>
    </section>
  );
}

export function TableView() {
  if (!convexConfigured) {
    return <TableViewFallback />;
  }
  return <TableViewLive />;
}

function TableViewLive() {
  const titles = useQuery(api.inventory.listReview);
  const columns = useQuery(api.views.getTableColumns);
  const setTableColumns = useMutation(api.views.setTableColumns);
  const createTitle = useMutation(api.titles.createTitle);
  const [draft, setDraft] = useState<DraftTitle>(emptyDraft);
  const [status, setStatus] = useState("");

  if (titles === undefined || columns === undefined) {
    return (
      <section className="card stack" aria-labelledby="table-view-heading">
        <h2 id="table-view-heading">Table</h2>
        <p className="muted" role="status">
          Loading table…
        </p>
      </section>
    );
  }

  const visible = columns;
  const rows = [...titles].sort((left, right) =>
    left.title.localeCompare(right.title),
  );

  async function saveColumns(next: TableColumn[]) {
    setStatus("Saving columns…");
    try {
      await setTableColumns({ columns: next });
      setStatus("Column selection saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save columns.",
      );
    }
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving title…");
    try {
      await createTitle({
        title: draft.title,
        author: draft.author,
        isbn: draft.isbn,
        ...(draft.synopsis.trim() === "" ? {} : { synopsis: draft.synopsis }),
        ...(draft.notes.trim() === "" ? {} : { notes: draft.notes }),
        ...(draft.purchaseInfo.trim() === ""
          ? {}
          : { purchaseInfo: draft.purchaseInfo }),
      });
      setDraft(emptyDraft);
      setStatus("Title saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save title.",
      );
    }
  }

  return (
    <section className="card stack" aria-labelledby="table-view-heading">
      <h2 id="table-view-heading">Table</h2>
      <fieldset className="stack">
        <legend>Columns</legend>
        {TABLE_COLUMNS.map((column) => {
          const checked = visible.includes(column);
          return (
            <label key={column} className="row">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = TABLE_COLUMNS.filter((candidate) =>
                    candidate === column ? !checked : visible.includes(candidate),
                  );
                  void saveColumns(next);
                }}
              />
              {columnLabel(column)}
            </label>
          );
        })}
      </fieldset>
      <form className="stack" onSubmit={submitDraft} style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th scope="col">Title</th>
              {visible.map((column) => (
                <th key={column} scope="col">
                  {columnLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <label>
                  New title
                  <input
                    required
                    name="title"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                {visible.includes("author") ? null : (
                  <label>
                    Author
                    <input
                      required
                      name="author"
                      value={draft.author}
                      onChange={(event) =>
                        setDraft({ ...draft, author: event.target.value })
                      }
                    />
                  </label>
                )}
                {visible.includes("isbn") ? null : (
                  <label>
                    ISBN
                    <input
                      required
                      name="isbn"
                      value={draft.isbn}
                      onChange={(event) =>
                        setDraft({ ...draft, isbn: event.target.value })
                      }
                    />
                  </label>
                )}
              </td>
              {visible.map((column) => {
                const field = draftField(column);
                if (field === undefined) {
                  return (
                    <td key={column}>
                      <span className="muted">
                        {isStockColumn(column) ? "—" : ""}
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={column}>
                    <input
                      required={field === "author" || field === "isbn"}
                      name={field}
                      value={draft[field]}
                      onChange={(event) =>
                        setDraft({ ...draft, [field]: event.target.value })
                      }
                    />
                  </td>
                );
              })}
            </tr>
            {rows.map((row) => (
              <tr key={row._id}>
                <th scope="row">
                  <Link href={`/books/${row._id}`}>{row.title}</Link>
                </th>
                {visible.map((column) => (
                  <td key={column}>{readCell(row, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="button">Save new title</button>
      </form>
      {rows.length === 0 ? (
        <p className="muted">No titles yet. Use the draft row to add one.</p>
      ) : null}
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
