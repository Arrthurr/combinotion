"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ROLES, type Role } from "@/lib/domain/types";

const roleLabels = {
  donor: "Donor",
  professional: "Professional contact",
  volunteer: "Volunteer",
  schoolStaff: "School staff",
  board: "Board member",
  reader: "Reader",
  reviewer: "Reviewer",
} as const;

export function InlineCreateSchool({
  onCreated,
}: {
  onCreated: (schoolId: Id<"schools">) => void;
}) {
  const createSchool = useMutation(api.schools.createSchool);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Saving school…");
    try {
      const schoolId = await createSchool({
        name: String(data.get("name") ?? ""),
        address: String(data.get("address") ?? ""),
      });
      form.reset();
      onCreated(schoolId);
      setStatus("School created and selected.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not create school.",
      );
    }
  }

  return (
    <details>
      <summary>Create a school without leaving this visit</summary>
      <form className="card stack" onSubmit={submit}>
        <label>
          New school name
          <input required name="name" />
        </label>
        <label>
          New school address
          <textarea required name="address" />
        </label>
        <button className="button">Create and select school</button>
        <p className="muted" role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </details>
  );
}

export function InlineCreatePerson({
  defaultRole,
  selectionLabel,
  onCreated,
}: {
  defaultRole: Role;
  selectionLabel: string;
  onCreated: (personId: Id<"people">) => void;
}) {
  const createPerson = useMutation(api.people.createPerson);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roles = ROLES.filter((role) => data.get(role) === "on");
    if (roles.length === 0) {
      setStatus("Choose at least one role.");
      return;
    }
    setStatus("Saving person…");
    try {
      const personId = await createPerson({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        roles,
      });
      form.reset();
      onCreated(personId);
      setStatus(`Person created and selected as ${selectionLabel}.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not create person.",
      );
    }
  }

  return (
    <details>
      <summary>Create a {selectionLabel} without leaving this visit</summary>
      <form className="card stack" onSubmit={submit}>
        <label>
          New person name
          <input required name="name" />
        </label>
        <label>
          New person email
          <input name="email" type="email" />
        </label>
        <fieldset>
          <legend>New person roles</legend>
          <div className="row">
            {ROLES.map((role) => (
              <label key={role}>
                <input
                  defaultChecked={role === defaultRole}
                  name={role}
                  type="checkbox"
                />
                {roleLabels[role]}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="button">Create and select person</button>
        <p className="muted" role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </details>
  );
}

export function InlineCreateTitle({
  onCreated,
}: {
  onCreated: (titleId: Id<"titles">) => void;
}) {
  const createTitle = useMutation(api.titles.createTitle);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Saving title…");
    try {
      const titleId = await createTitle({
        title: String(data.get("title") ?? ""),
        author: String(data.get("author") ?? ""),
        isbn: String(data.get("isbn") ?? ""),
      });
      form.reset();
      onCreated(titleId);
      setStatus("Title created and selected.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not create title.",
      );
    }
  }

  return (
    <details>
      <summary>Create a title without leaving this visit</summary>
      <form className="card stack" onSubmit={submit}>
        <label>
          New title
          <input required name="title" />
        </label>
        <label>
          New title author
          <input required name="author" />
        </label>
        <label>
          New title ISBN
          <input required name="isbn" />
        </label>
        <button className="button">Create and select title</button>
        <p className="muted" role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </details>
  );
}
