"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function SchoolForm({
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
        School name
        <input required disabled={disabled} name="name" />
      </label>
      <label>
        School address
        <textarea required disabled={disabled} name="address" />
      </label>
      <button className="button" disabled={disabled}>
        Save school
      </button>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

function SchoolCard({
  school,
  people,
}: {
  school: Doc<"schools">;
  people: Doc<"people">[];
}) {
  const contacts = useQuery(api.schools.listContacts, {
    schoolId: school._id,
  });
  const addContact = useMutation(api.schools.addContact);
  const [status, setStatus] = useState("");

  async function attach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const person = people.find(
      (candidate) => candidate._id === data.get("personId"),
    );
    if (!person) {
      setStatus("Choose a contact.");
      return;
    }
    setStatus("Attaching contact…");
    try {
      await addContact({ schoolId: school._id, personId: person._id });
      form.reset();
      setStatus("Contact attached.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not attach contact.",
      );
    }
  }

  return (
    <article className="card stack">
      <div>
        <h3>{school.name}</h3>
        <p className="muted">{school.address}</p>
      </div>
      <div>
        <h4>Contacts</h4>
        {contacts === undefined ? (
          <p className="muted">Loading contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="muted">No contacts attached.</p>
        ) : (
          <ul>
            {contacts.map((contact) => (
              <li key={contact._id}>{contact.person.name}</li>
            ))}
          </ul>
        )}
      </div>
      <form className="row" onSubmit={attach}>
        <label>
          Contact person
          <select required name="personId" defaultValue="">
            <option value="">Choose a person</option>
            {people.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button">Attach contact</button>
      </form>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </article>
  );
}

export function SchoolsManager() {
  if (!convexConfigured) {
    return (
      <>
        <SchoolForm
          disabled
          status="Connect Convex to save and list schools."
        />
        <section className="card stack">
          <h2>School contacts</h2>
          <label>
            Contact person
            <select disabled>
              <option>Choose a person</option>
            </select>
          </label>
        </section>
      </>
    );
  }
  return <SchoolsManagerLive />;
}

function SchoolsManagerLive() {
  const schools = useQuery(api.schools.listSchools);
  const people = useQuery(api.people.listPeople);
  const createSchool = useMutation(api.schools.createSchool);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Saving school…");
    try {
      await createSchool({
        name: String(data.get("name") ?? ""),
        address: String(data.get("address") ?? ""),
      });
      form.reset();
      setStatus("School saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save school.",
      );
    }
  }

  return (
    <>
      <section className="stack" aria-labelledby="create-school-heading">
        <h2 id="create-school-heading">Create school</h2>
        <SchoolForm disabled={false} status={status} onSubmit={submit} />
      </section>
      <section className="stack" aria-labelledby="schools-list-heading">
        <h2 id="schools-list-heading">Schools</h2>
        {schools === undefined || people === undefined ? (
          <p className="muted" role="status">
            Loading schools…
          </p>
        ) : schools.length === 0 ? (
          <p className="muted">No schools yet.</p>
        ) : (
          <div className="stack">
            {schools.map((school) => (
              <SchoolCard
                key={school._id}
                school={school}
                people={people}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
