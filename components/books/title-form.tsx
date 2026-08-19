"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { IsbnLookupResult, IsbnSuggestion } from "@/lib/domain/enrichment";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type CatalogDraft = {
  title: string;
  author: string;
  isbn: string;
  synopsis: string;
  notes: string;
  coverUrl: string;
  purchaseInfo: string;
  supplierIds: Id<"suppliers">[];
};

export type TitleFormMode =
  | { kind: "create" }
  | { kind: "edit"; titleId: Id<"titles">; initial: CatalogDraft };

type SuggestionField = keyof IsbnSuggestion;

type LookupState = { kind: "idle" } | { kind: "loading" } | IsbnLookupResult;

const emptyDraft: CatalogDraft = {
  title: "",
  author: "",
  isbn: "",
  synopsis: "",
  notes: "",
  coverUrl: "",
  purchaseInfo: "",
  supplierIds: [],
};

const suggestionFields = [
  "title",
  "author",
  "coverUrl",
  "synopsis",
] as const satisfies readonly SuggestionField[];

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function suggestionLabel(field: SuggestionField) {
  switch (field) {
    case "title":
      return "Title";
    case "author":
      return "Author";
    case "coverUrl":
      return "Cover URL";
    case "synopsis":
      return "Synopsis";
    default: {
      const unhandledField: never = field;
      throw new Error(`Unhandled suggestion field: ${unhandledField}`);
    }
  }
}

function lookupMessage(lookup: LookupState) {
  switch (lookup.kind) {
    case "idle":
      return "";
    case "loading":
      return "Looking up ISBN…";
    case "found":
      return "ISBN match found. Confirm each field before saving.";
    case "notFound":
      return "No Open Library match. Enter the title details manually.";
    case "unavailable":
      return "ISBN lookup is unavailable. Enter the title details manually.";
    default: {
      const unhandledLookup: never = lookup;
      throw new Error(`Unhandled ISBN lookup: ${unhandledLookup}`);
    }
  }
}

function TitleFields({
  draft,
  disabled,
  lookup,
  status,
  onChange,
  onLookup,
  onApplyEmpty,
  onApplyField,
  onSubmit,
  suppliers,
}: {
  draft: CatalogDraft;
  disabled: boolean;
  lookup: LookupState;
  status: string;
  onChange?: (draft: CatalogDraft) => void;
  onLookup?: () => void;
  onApplyEmpty?: () => void;
  onApplyField?: (field: SuggestionField) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  suppliers?: { _id: Id<"suppliers">; name: string }[];
}) {
  const suggestion = lookup.kind === "found" ? lookup.suggestion : undefined;

  function update<Key extends keyof CatalogDraft>(
    key: Key,
    value: CatalogDraft[Key],
  ) {
    onChange?.({ ...draft, [key]: value });
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <label>
        Title
        <input
          required
          name="title"
          value={draft.title}
          disabled={disabled}
          onChange={(event) => update("title", event.target.value)}
        />
      </label>
      <label>
        Author
        <input
          required
          name="author"
          value={draft.author}
          disabled={disabled}
          onChange={(event) => update("author", event.target.value)}
        />
      </label>
      <label>
        ISBN
        <input
          required
          name="isbn"
          value={draft.isbn}
          disabled={disabled}
          onChange={(event) => update("isbn", event.target.value)}
        />
      </label>
      <div className="row">
        <button
          className="button"
          type="button"
          disabled={disabled || lookup.kind === "loading"}
          onClick={onLookup}
        >
          Look up ISBN
        </button>
      </div>
      <p className="muted" role="status" aria-live="polite">
        {lookupMessage(lookup)}
      </p>
      {suggestion ? (
        <fieldset className="stack">
          <legend>Suggested catalog fields</legend>
          <p className="muted">
            Empty fields can be filled from the match. Filled fields stay until
            you replace them.
          </p>
          <ul className="stack">
            {suggestionFields.map((field) => {
              const value = suggestion[field];
              if (value === undefined) {
                return null;
              }
              const occupied = draft[field].trim().length > 0;
              return (
                <li key={field} className="row">
                  <span>
                    {suggestionLabel(field)}: {value}
                  </span>
                  <button
                    className="button"
                    type="button"
                    onClick={() => onApplyField?.(field)}
                  >
                    {occupied ? "Replace" : "Use this"}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="button" type="button" onClick={onApplyEmpty}>
            Fill empty fields
          </button>
        </fieldset>
      ) : null}
      <label>
        Synopsis
        <textarea
          name="synopsis"
          value={draft.synopsis}
          disabled={disabled}
          onChange={(event) => update("synopsis", event.target.value)}
        />
      </label>
      <label>
        Notes
        <textarea
          name="notes"
          value={draft.notes}
          disabled={disabled}
          onChange={(event) => update("notes", event.target.value)}
        />
      </label>
      <label>
        Cover URL
        <input
          name="coverUrl"
          value={draft.coverUrl}
          disabled={disabled}
          onChange={(event) => update("coverUrl", event.target.value)}
        />
      </label>
      <label>
        Purchase info
        <input
          name="purchaseInfo"
          value={draft.purchaseInfo}
          disabled={disabled}
          onChange={(event) => update("purchaseInfo", event.target.value)}
        />
      </label>
      <fieldset className="stack">
        <legend>Suppliers</legend>
        {suppliers === undefined ? (
          <p className="muted">
            {disabled
              ? "Suppliers will appear after Convex is configured."
              : "Loading suppliers…"}
          </p>
        ) : suppliers.length === 0 ? (
          <p className="muted">No suppliers yet.</p>
        ) : (
          suppliers.map((supplier) => (
            <label key={supplier._id} className="row">
              <input
                type="checkbox"
                disabled={disabled}
                checked={draft.supplierIds.includes(supplier._id)}
                onChange={() => {
                  const selected = draft.supplierIds.includes(supplier._id)
                    ? draft.supplierIds.filter((id) => id !== supplier._id)
                    : [...draft.supplierIds, supplier._id];
                  update("supplierIds", selected);
                }}
              />
              {supplier.name}
            </label>
          ))
        )}
      </fieldset>
      <button className="button" disabled={disabled}>
        Save title
      </button>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

export function TitleForm({ mode }: { mode: TitleFormMode }) {
  if (!convexConfigured) {
    return (
      <TitleFields
        draft={emptyDraft}
        disabled
        lookup={{ kind: "idle" }}
        status="Saving titles is not available yet."
      />
    );
  }
  return <TitleFormLive mode={mode} />;
}

function TitleFormLive({ mode }: { mode: TitleFormMode }) {
  const router = useRouter();
  const createTitle = useMutation(api.titles.createTitle);
  const updateTitle = useMutation(api.titles.updateTitle);
  const lookupIsbn = useAction(api.integrations.openLibrary.lookupIsbn);
  const suppliers = useQuery(api.suppliers.listSuppliers);
  const [draft, setDraft] = useState<CatalogDraft>(
    mode.kind === "edit" ? mode.initial : emptyDraft,
  );
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const [applied, setApplied] = useState<Set<SuggestionField>>(new Set());
  const [status, setStatus] = useState("");

  function applyField(field: SuggestionField) {
    if (lookup.kind !== "found") {
      return;
    }
    const value = lookup.suggestion[field];
    if (value === undefined) {
      return;
    }
    setDraft((current) => ({ ...current, [field]: value }));
    setApplied((current) => new Set(current).add(field));
  }

  function applyEmptyFields() {
    if (lookup.kind !== "found") {
      return;
    }
    const suggestion = lookup.suggestion;
    const nextApplied = new Set(applied);
    setDraft((current) => {
      const next = { ...current };
      for (const field of suggestionFields) {
        const value = suggestion[field];
        if (value === undefined || current[field].trim().length > 0) {
          continue;
        }
        next[field] = value;
        nextApplied.add(field);
      }
      return next;
    });
    setApplied(nextApplied);
  }

  async function lookupCurrentIsbn() {
    setLookup({ kind: "loading" });
    setApplied(new Set());
    setStatus("Looking up ISBN…");
    try {
      const result = await lookupIsbn({ isbn: draft.isbn });
      setLookup(result);
      setStatus(lookupMessage(result));
    } catch (error) {
      setLookup({ kind: "unavailable" });
      setStatus(
        error instanceof Error ? error.message : "ISBN lookup is unavailable.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving…");
    const enrichmentSource =
      lookup.kind === "found" && applied.size > 0
        ? lookup.enrichmentSource
        : undefined;
    const payload = {
      title: draft.title,
      author: draft.author,
      isbn: draft.isbn,
      ...(optionalText(draft.synopsis) === undefined
        ? {}
        : { synopsis: draft.synopsis }),
      ...(optionalText(draft.notes) === undefined ? {} : { notes: draft.notes }),
      ...(optionalText(draft.coverUrl) === undefined
        ? {}
        : { coverUrl: draft.coverUrl }),
      ...(optionalText(draft.purchaseInfo) === undefined
        ? {}
        : { purchaseInfo: draft.purchaseInfo }),
      ...(draft.supplierIds.length === 0
        ? {}
        : { supplierIds: draft.supplierIds }),
      ...(enrichmentSource === undefined ? {} : { enrichmentSource }),
    };
    try {
      switch (mode.kind) {
        case "create": {
          const titleId = await createTitle(payload);
          setDraft(emptyDraft);
          setLookup({ kind: "idle" });
          setApplied(new Set());
          setStatus("Title saved.");
          router.push(`/books/${titleId}`);
          break;
        }
        case "edit":
          await updateTitle({ titleId: mode.titleId, ...payload });
          setStatus("Title saved.");
          break;
        default: {
          const unhandledMode: never = mode;
          throw new Error(`Unhandled title form mode: ${unhandledMode}`);
        }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save title.");
    }
  }

  return (
    <TitleFields
      draft={draft}
      disabled={false}
      lookup={lookup}
      status={status}
      suppliers={suppliers}
      onChange={(next) => {
        if (next.isbn !== draft.isbn) {
          setLookup({ kind: "idle" });
          setApplied(new Set());
        }
        setDraft(next);
      }}
      onLookup={() => {
        void lookupCurrentIsbn();
      }}
      onApplyEmpty={applyEmptyFields}
      onApplyField={applyField}
      onSubmit={submit}
    />
  );
}
