"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";

type IntakeListItem = FunctionReturnType<typeof api.intake.listItems>[number];

function candidateLabel(item: IntakeListItem) {
  if (item.state.kind === "invalid") {
    return item.state.errors.join("; ");
  }
  const candidate = item.state.candidate;
  if (candidate.kind === "review") {
    return `${candidate.reviewer} · ${candidate.isbn ?? candidate.titleText ?? "No ISBN"}`;
  }
  return `${candidate.name}${candidate.email ? ` · ${candidate.email}` : ""}`;
}

export function PendingItem({
  item,
  onStatus,
}: {
  item: IntakeListItem;
  onStatus: (message: string) => void;
}) {
  const resolveItem = useMutation(api.intake.resolveItem);
  const [busy, setBusy] = useState(false);

  async function resolve(action: Parameters<typeof resolveItem>[0]["action"]) {
    if (busy) {
      return;
    }
    setBusy(true);
    onStatus(`Resolving ${candidateLabel(item)}…`);
    try {
      await resolveItem({
        itemId: item.itemId,
        fingerprint: item.fingerprint,
        action,
      });
      onStatus(`Resolved ${candidateLabel(item)}.`);
    } catch (error) {
      onStatus(
        error instanceof Error ? error.message : "Could not resolve this row.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (item.state.kind === "invalid") {
    return (
      <li className="card stack">
        <strong>Invalid row</strong>
        <p>{item.state.errors.join("; ")}</p>
        <p className="muted">
          Fix the sheet row. The next poll will reparse it.
        </p>
      </li>
    );
  }

  if (item.state.kind === "resolved") {
    return (
      <li className="card stack">
        <strong>{candidateLabel(item)}</strong>
        <p>
          {item.state.resolution.kind === "dismissed"
            ? `Dismissed: ${item.state.resolution.reason}`
            : `Resolved as ${item.state.resolution.kind}`}
        </p>
        {item.state.sourceDrift ? (
          <p role="status">The sheet row changed after this was resolved.</p>
        ) : null}
      </li>
    );
  }

  const candidate = item.state.candidate;

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw = String(data.get("record") ?? "");
    const [kind, id] = raw.split(":");
    if (
      kind !== "person" &&
      kind !== "school" &&
      kind !== "title" &&
      kind !== "review"
    ) {
      onStatus("Choose a record to attach.");
      return;
    }
    await resolve({ kind: "attach", record: { kind, id } });
  }

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await resolve({
      kind: "createPerson",
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? "") || undefined,
      schoolName: String(data.get("schoolName") ?? "") || undefined,
      schoolAddress: String(data.get("schoolAddress") ?? "") || undefined,
      personId: (String(data.get("personId") ?? "") || undefined) as
        Id<"people"> | undefined,
      schoolId: (String(data.get("schoolId") ?? "") || undefined) as
        Id<"schools"> | undefined,
    });
  }

  async function createTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await resolve({
      kind: "createTitle",
      title: String(data.get("title") ?? ""),
      author: String(data.get("author") ?? ""),
      isbn: String(data.get("isbn") ?? ""),
    });
  }

  async function dismiss(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await resolve({
      kind: "dismiss",
      reason: String(data.get("reason") ?? ""),
    });
  }

  return (
    <li className="card stack">
      <strong>{candidateLabel(item)}</strong>
      {candidate.kind === "review" ? (
        <p>{candidate.feedback}</p>
      ) : candidate.message ? (
        <p>{candidate.message}</p>
      ) : null}
      <form className="stack" onSubmit={attach}>
        <label>
          Attach to an existing record
          <select name="record" required disabled={busy} defaultValue="">
            <option value="" disabled>
              Choose a record
            </option>
            {item.attachmentOptions.map(({ kind, id, label }) => (
              <option key={`${kind}:${id}`} value={`${kind}:${id}`}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={busy} type="submit">
          Attach source
        </button>
      </form>
      {candidate.kind === "donationApplication" ? (
        <form className="stack" onSubmit={createPerson}>
          <label>
            Existing person (optional)
            <select name="personId" disabled={busy} defaultValue="">
              <option value="">Match email or create a person</option>
              {item.attachmentOptions
                .filter((option) => option.kind === "person")
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Existing school (optional)
            <select name="schoolId" disabled={busy} defaultValue="">
              <option value="">Match school name and address</option>
              {item.attachmentOptions
                .filter((option) => option.kind === "school")
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Name
            <input
              name="name"
              required
              disabled={busy}
              defaultValue={candidate.name}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              disabled={busy}
              defaultValue={candidate.email ?? ""}
            />
          </label>
          <label>
            School name
            <input
              name="schoolName"
              disabled={busy}
              defaultValue={candidate.schoolName ?? ""}
            />
          </label>
          <label>
            School address
            <input
              name="schoolAddress"
              disabled={busy}
              defaultValue={candidate.schoolAddress ?? ""}
            />
          </label>
          <button className="button" disabled={busy} type="submit">
            Resolve donor from this row
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={createTitle}>
          <label>
            Title
            <input
              name="title"
              required
              disabled={busy}
              defaultValue={candidate.titleText ?? ""}
            />
          </label>
          <label>
            Author
            <input name="author" required disabled={busy} />
          </label>
          <label>
            ISBN
            <input
              name="isbn"
              required
              disabled={busy}
              defaultValue={candidate.isbn ?? ""}
            />
          </label>
          <button className="button" disabled={busy} type="submit">
            Add this reviewed book to inventory
          </button>
        </form>
      )}
      <form className="stack" onSubmit={dismiss}>
        <label>
          Dismiss reason
          <input name="reason" required disabled={busy} />
        </label>
        <button className="button" disabled={busy} type="submit">
          Dismiss
        </button>
      </form>
    </li>
  );
}
