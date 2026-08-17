"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { RequestableTitle } from "@/convex/titles";

function responseField(body: unknown, field: "error" | "reference") {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const value = Reflect.get(body, field);
  return typeof value === "string" ? value : undefined;
}

export function RequestForm({
  titles,
  allowUnconfiguredEntry = false,
}: {
  titles: RequestableTitle[];
  allowUnconfiguredEntry?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const lines = titles.flatMap((title) => {
      const quantity = Number(form.get(`quantity:${title.isbn}`) ?? 0);
      return quantity >= 1 ? [{ isbn: title.isbn, quantity }] : [];
    });
    if (titles.length === 0 && allowUnconfiguredEntry) {
      const isbn = String(form.get("fallbackIsbn") ?? "").trim();
      const quantity = Number(form.get("fallbackQuantity") ?? 0);
      if (isbn && quantity >= 1) {
        lines.push({ isbn, quantity });
      }
    }
    if (lines.length === 0) {
      setStatus("Choose at least one title.");
      return;
    }

    setSubmitting(true);
    setStatus("Submitting your request…");
    try {
      const response = await fetch("/api/school-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolName: String(form.get("schoolName") ?? ""),
          address: String(form.get("address") ?? ""),
          contactName: String(form.get("contactName") ?? ""),
          email: String(form.get("email") ?? ""),
          website: String(form.get("website") ?? ""),
          lines,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        }),
      });
      const body: unknown = await response.json();
      const reference = responseField(body, "reference");
      if (response.ok && reference) {
        formElement.reset();
        setIdempotencyKey(crypto.randomUUID());
        setStatus(`Request received: ${reference}`);
        return;
      }
      const error = responseField(body, "error");
      setStatus(
        response.status === 409
          ? error ?? "Those copies are no longer available."
          : error ?? "Could not submit your request.",
      );
    } catch {
      setStatus("Request service unavailable");
    } finally {
      setSubmitting(false);
    }
  }

  const emptyMessage =
    titles.length === 0
      ? "No titles are available to request right now."
      : "";
  const canSubmit = titles.length > 0 || allowUnconfiguredEntry;

  return (
    <form className="card stack" onSubmit={submit}>
      <label>
        School name
        <input required name="schoolName" />
      </label>
      <label>
        School address
        <textarea required name="address" />
      </label>
      <label>
        Contact name
        <input required name="contactName" />
      </label>
      <label>
        Email
        <input required type="email" name="email" />
      </label>
      {titles.map((title) => (
        <div className="card stack" key={title.isbn}>
          <div>
            <strong>{title.title}</strong>
            <p className="muted">
              {title.author} · {title.availableQuantity} available
            </p>
          </div>
          <label>
            Copies of {title.title}
            <input
              min="0"
              max={title.availableQuantity}
              step="1"
              type="number"
              name={`quantity:${title.isbn}`}
              defaultValue="0"
            />
          </label>
        </div>
      ))}
      {titles.length === 0 && allowUnconfiguredEntry ? (
        <div className="stack">
          <label>
            Title ISBN
            <input required name="fallbackIsbn" />
          </label>
          <label>
            Copies
            <input
              required
              min="1"
              step="1"
              type="number"
              name="fallbackQuantity"
            />
          </label>
        </div>
      ) : null}
      <label className="skip">
        Leave blank
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <input
        type="hidden"
        name="idempotencyKey"
        value={idempotencyKey}
        readOnly
      />
      <button
        className="button"
        disabled={submitting || !canSubmit}
      >
        {submitting ? "Submitting…" : "Reserve requested copies"}
      </button>
      <p role="status" aria-live="polite">
        {status || emptyMessage}
      </p>
    </form>
  );
}
