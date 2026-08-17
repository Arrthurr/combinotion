"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { ROLES } from "@/lib/domain/types";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

const roleLabels = {
  donor: "Donor",
  professional: "Professional contact",
  volunteer: "Volunteer",
  schoolStaff: "School staff",
  board: "Board member",
  reader: "Reader",
  reviewer: "Reviewer",
} as const;

function PersonForm({
  disabled,
  status,
  onSubmit,
}: {
  disabled: boolean;
  status: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="card stack" onSubmit={onSubmit}>
      <label>
        Name
        <input required disabled={disabled} name="name" />
      </label>
      <label>
        Email
        <input disabled={disabled} name="email" type="email" />
      </label>
      <fieldset>
        <legend>Roles</legend>
        <div className="row">
          {ROLES.map((role) => (
            <label key={role}>
              <input disabled={disabled} name={role} type="checkbox" />
              {roleLabels[role]}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="button" disabled={disabled}>
        Save person
      </button>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

export function PeopleManager() {
  if (!convexConfigured) {
    return (
      <PersonForm
        disabled
        status="Connect Convex to save and list people."
      />
    );
  }
  return <PeopleManagerLive />;
}

function PeopleManagerLive() {
  const people = useQuery(api.people.listPeople);
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
      await createPerson({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        roles,
      });
      form.reset();
      setStatus("Person saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save person.",
      );
    }
  }

  return (
    <>
      <section className="stack" aria-labelledby="create-person-heading">
        <h2 id="create-person-heading">Create person</h2>
        <PersonForm disabled={false} status={status} onSubmit={submit} />
      </section>
      <section className="stack" aria-labelledby="people-list-heading">
        <h2 id="people-list-heading">People</h2>
        {people === undefined ? (
          <p className="muted" role="status">
            Loading people…
          </p>
        ) : people.length === 0 ? (
          <p className="muted">No people yet.</p>
        ) : (
          <ul className="stack">
            {people.map((person) => (
              <li className="card" key={person._id}>
                <strong>{person.name}</strong>
                {person.email ? (
                  <p>
                    <a href={`mailto:${person.email}`}>{person.email}</a>
                  </p>
                ) : null}
                <p className="muted">
                  {person.roles.map((role) => roleLabels[role]).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
