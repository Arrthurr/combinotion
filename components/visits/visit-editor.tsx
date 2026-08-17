"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  InlineCreatePerson,
  InlineCreateSchool,
  InlineCreateTitle,
} from "./inline-create";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type DraftBook = {
  key: number;
  titleId: Id<"titles"> | "";
  donatedQuantity: number;
  readAloud: boolean;
};

type OverlayPerson = {
  personId: Id<"people">;
  name: string;
};

function peopleOptions(
  people: { _id: Id<"people">; name: string }[] | undefined,
  overlay: OverlayPerson[],
  selectedIds: Id<"people">[],
) {
  const listed = new Map(
    (people ?? []).map((person) => [person._id, person.name]),
  );
  for (const person of overlay) {
    if (!listed.has(person.personId)) {
      listed.set(person.personId, person.name);
    }
  }
  for (const personId of selectedIds) {
    if (!listed.has(personId)) {
      listed.set(personId, "Selected person");
    }
  }
  return [...listed.entries()].map(([personId, name]) => ({
    personId,
    name,
  }));
}

function dateInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function VisitEditorFallback() {
  return (
    <form className="card stack">
      <label>
        School
        <select disabled>
          <option>Choose a school</option>
        </select>
      </label>
      <label>
        Occurred at
        <input disabled type="date" />
      </label>
      <label>
        Staff present
        <select disabled multiple>
          <option>Choose staff</option>
        </select>
      </label>
      <label>
        Readers
        <select disabled multiple>
          <option>Choose readers</option>
        </select>
      </label>
      <fieldset>
        <legend>Books</legend>
        <label>
          Title
          <select disabled>
            <option>Choose a title</option>
          </select>
        </label>
        <label>
          Donated quantity
          <input disabled min="0" step="1" type="number" />
        </label>
        <label>
          <input disabled type="checkbox" />
          Read aloud
        </label>
      </fieldset>
      <label>
        Follow-up
        <textarea disabled />
      </label>
      <button className="button" disabled>
        Save visit
      </button>
      <p className="muted" role="status">
        Connect Convex to save visits.
      </p>
    </form>
  );
}

export function VisitEditor({ visitId }: { visitId?: Id<"visits"> }) {
  if (!convexConfigured) {
    return <VisitEditorFallback />;
  }
  return <VisitEditorLive visitId={visitId} />;
}

function VisitEditorLive({ visitId }: { visitId?: Id<"visits"> }) {
  const schools = useQuery(api.schools.listSchools);
  const people = useQuery(api.people.listPeople);
  const titles = useQuery(api.titles.listTitles);
  const [savedVisitId, setSavedVisitId] = useState(visitId);
  const existing = useQuery(
    api.visits.getVisit,
    savedVisitId === undefined ? "skip" : { visitId: savedVisitId },
  );
  const saveVisit = useMutation(api.visits.saveVisit);
  const deleteVisit = useMutation(api.visits.deleteVisit);
  const loadedGeneration = useRef<number | null>(null);
  const skipNextHydrate = useRef(false);
  const [schoolId, setSchoolId] = useState<Id<"schools"> | "">("");
  const [occurredAt, setOccurredAt] = useState(
    dateInputValue(Date.now()),
  );
  const [followUp, setFollowUp] = useState("");
  const [staffPersonIds, setStaffPersonIds] = useState<Id<"people">[]>(
    [],
  );
  const [readerPersonIds, setReaderPersonIds] = useState<Id<"people">[]>(
    [],
  );
  const [personOverlay, setPersonOverlay] = useState<OverlayPerson[]>(
    [],
  );
  const [books, setBooks] = useState<DraftBook[]>([
    { key: 0, titleId: "", donatedQuantity: 0, readAloud: true },
  ]);
  const [nextBookKey, setNextBookKey] = useState(1);
  const [status, setStatus] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing === undefined || existing === null) {
      return;
    }
    if (loadedGeneration.current === existing.effectGeneration) {
      return;
    }
    if (skipNextHydrate.current) {
      skipNextHydrate.current = false;
      loadedGeneration.current = existing.effectGeneration;
      return;
    }
    if (loadedGeneration.current !== null && dirty) {
      loadedGeneration.current = existing.effectGeneration;
      setStatus(
        "This visit was updated elsewhere. Your unsaved changes were kept.",
      );
      return;
    }
    loadedGeneration.current = existing.effectGeneration;
    setSchoolId(existing.school.schoolId);
    setOccurredAt(dateInputValue(existing.occurredAt));
    setFollowUp(existing.followUp ?? "");
    setStaffPersonIds(
      existing.staffPresent.map((person) => person.personId),
    );
    setReaderPersonIds(existing.readers.map((person) => person.personId));
    setPersonOverlay([
      ...existing.staffPresent.map((person) => ({
        personId: person.personId,
        name: person.name,
      })),
      ...existing.readers.map((person) => ({
        personId: person.personId,
        name: person.name,
      })),
    ]);
    setBooks(
      existing.books.map((book, index) => ({
        key: index,
        titleId: book.titleId,
        donatedQuantity: book.donatedQuantity,
        readAloud: book.readAloud,
      })),
    );
    setNextBookKey(existing.books.length);
    setDirty(false);
  }, [existing, dirty]);

  function markDirty() {
    setDirty(true);
  }

  function selectSchool(value: string) {
    const school = schools?.find((candidate) => candidate._id === value);
    markDirty();
    setSchoolId(school?._id ?? "");
  }

  function selectPeople(
    values: string[],
    current: Id<"people">[],
    update: (personIds: Id<"people">[]) => void,
  ) {
    const listedIds = new Set((people ?? []).map((person) => person._id));
    const pending = current.filter((personId) => !listedIds.has(personId));
    const selectedListed =
      people
        ?.filter((person) => values.includes(person._id))
        .map((person) => person._id) ?? [];
    markDirty();
    update([...pending, ...selectedListed]);
  }

  function updateBook(
    key: number,
    update: Partial<Omit<DraftBook, "key">>,
  ) {
    markDirty();
    setBooks((current) =>
      current.map((book) =>
        book.key === key ? { ...book, ...update } : book,
      ),
    );
  }

  function selectTitle(key: number, value: string) {
    const title = titles?.find((candidate) => candidate._id === value);
    updateBook(key, { titleId: title?._id ?? "" });
  }

  function addBook(titleId: Id<"titles"> | "" = "") {
    markDirty();
    setBooks((current) => [
      ...current,
      {
        key: nextBookKey,
        titleId,
        donatedQuantity: 0,
        readAloud: true,
      },
    ]);
    setNextBookKey((current) => current + 1);
  }

  function selectCreatedTitle(titleId: Id<"titles">) {
    const emptyLine = books.find((book) => book.titleId === "");
    if (emptyLine) {
      updateBook(emptyLine.key, { titleId });
      return;
    }
    addBook(titleId);
  }

  function removeBook(key: number) {
    markDirty();
    setBooks((current) => current.filter((book) => book.key !== key));
  }

  function addSelectedPerson(
    created: OverlayPerson,
    update: (value: (current: Id<"people">[]) => Id<"people">[]) => void,
  ) {
    markDirty();
    setPersonOverlay((current) =>
      current.some((person) => person.personId === created.personId)
        ? current
        : [...current, created],
    );
    update((current) =>
      current.includes(created.personId)
        ? current
        : [...current, created.personId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (schoolId === "") {
      setStatus("Choose a school.");
      return;
    }
    if (readerPersonIds.length === 0) {
      setStatus("Choose at least one reader.");
      return;
    }
    const completeBooks = books.flatMap((book) =>
      book.titleId === ""
        ? []
        : [
            {
              titleId: book.titleId,
              donatedQuantity: book.donatedQuantity,
              readAloud: book.readAloud,
            },
          ],
    );
    if (completeBooks.length !== books.length || books.length === 0) {
      setStatus("Choose a title for every book.");
      return;
    }
    setBusy(true);
    setStatus(savedVisitId ? "Updating visit…" : "Saving visit…");
    try {
      const nextVisitId = await saveVisit({
        ...(savedVisitId === undefined ? {} : { visitId: savedVisitId }),
        schoolId,
        occurredAt: new Date(`${occurredAt}T12:00:00`).getTime(),
        followUp,
        staffPersonIds,
        readerPersonIds,
        books: completeBooks,
      });
      skipNextHydrate.current = true;
      setDirty(false);
      setSavedVisitId(nextVisitId);
      setStatus(savedVisitId ? "Visit updated." : "Visit saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save visit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeVisit() {
    if (savedVisitId === undefined || busy) {
      return;
    }
    setBusy(true);
    setStatus("Deleting visit…");
    try {
      await deleteVisit({ visitId: savedVisitId });
      setDeleted(true);
      setStatus("Visit deleted and inventory restored.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not delete visit.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (
    schools === undefined ||
    people === undefined ||
    titles === undefined ||
    (savedVisitId !== undefined && existing === undefined)
  ) {
    return (
      <p className="muted" role="status">
        Loading visit editor…
      </p>
    );
  }

  if (deleted) {
    return (
      <section className="card stack">
        <p role="status" aria-live="polite">
          {status}
        </p>
        <Link className="button" href="/visits">
          Return to visits
        </Link>
      </section>
    );
  }

  if (savedVisitId !== undefined && existing === null) {
    return (
      <section className="card stack">
        <p role="status">Visit not found.</p>
        <Link className="button" href="/visits">
          Return to visits
        </Link>
      </section>
    );
  }

  return (
    <>
      <form className="card stack" onSubmit={submit}>
        <label>
          School
          <select
            required
            value={schoolId}
            onChange={(event) => selectSchool(event.target.value)}
          >
            <option value="">Choose a school</option>
            {schools.map((school) => (
              <option key={school._id} value={school._id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <InlineCreateSchool
          onCreated={(createdSchoolId) => {
            markDirty();
            setSchoolId(createdSchoolId);
          }}
        />
        <label>
          Occurred at
          <input
            required
            type="date"
            value={occurredAt}
            onChange={(event) => {
              markDirty();
              setOccurredAt(event.target.value);
            }}
          />
        </label>
        <label>
          Staff present
          <select
            multiple
            value={staffPersonIds}
            onChange={(event) =>
              selectPeople(
                Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
                staffPersonIds,
                setStaffPersonIds,
              )
            }
          >
            {peopleOptions(people, personOverlay, staffPersonIds).map(
              (person) => (
                <option key={person.personId} value={person.personId}>
                  {person.name}
                </option>
              ),
            )}
          </select>
        </label>
        <InlineCreatePerson
          defaultRole="volunteer"
          selectionLabel="staff member"
          onCreated={(created) =>
            addSelectedPerson(created, setStaffPersonIds)
          }
        />
        <label>
          Readers
          <select
            required
            multiple
            value={readerPersonIds}
            onChange={(event) =>
              selectPeople(
                Array.from(
                  event.target.selectedOptions,
                  (option) => option.value,
                ),
                readerPersonIds,
                setReaderPersonIds,
              )
            }
          >
            {peopleOptions(people, personOverlay, readerPersonIds).map(
              (person) => (
                <option key={person.personId} value={person.personId}>
                  {person.name}
                </option>
              ),
            )}
          </select>
        </label>
        <InlineCreatePerson
          defaultRole="reader"
          selectionLabel="reader"
          onCreated={(created) =>
            addSelectedPerson(created, setReaderPersonIds)
          }
        />
        <fieldset className="stack">
          <legend>Books</legend>
          {books.map((book, index) => (
            <div className="card stack" key={book.key}>
              <label>
                Title for book {index + 1}
                <select
                  required
                  value={book.titleId}
                  onChange={(event) =>
                    selectTitle(book.key, event.target.value)
                  }
                >
                  <option value="">Choose a title</option>
                  {titles.map((title) => (
                    <option key={title._id} value={title._id}>
                      {title.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Donated quantity for book {index + 1}
                <input
                  required
                  min="0"
                  step="1"
                  type="number"
                  value={book.donatedQuantity}
                  onChange={(event) =>
                    updateBook(book.key, {
                      donatedQuantity: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <input
                  checked={book.readAloud}
                  type="checkbox"
                  onChange={(event) =>
                    updateBook(book.key, {
                      readAloud: event.target.checked,
                    })
                  }
                />
                Read aloud for book {index + 1}
              </label>
              {books.length > 1 ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => removeBook(book.key)}
                >
                  Remove book
                </button>
              ) : null}
            </div>
          ))}
          <div className="row">
            <button
              className="button"
              type="button"
              onClick={() => addBook()}
            >
              Add another book
            </button>
          </div>
          <InlineCreateTitle onCreated={selectCreatedTitle} />
        </fieldset>
        <label>
          Follow-up
          <textarea
            value={followUp}
            onChange={(event) => {
              markDirty();
              setFollowUp(event.target.value);
            }}
          />
        </label>
        <div className="row">
          <button className="button" disabled={busy}>
            {savedVisitId ? "Update visit" : "Save visit"}
          </button>
          {savedVisitId ? (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={removeVisit}
            >
              Delete visit
            </button>
          ) : null}
        </div>
        <p className="muted" role="status" aria-live="polite">
          {status}
        </p>
      </form>
      {existing && existing.books.length > 0 ? (
        <section className="card stack" aria-labelledby="consumption-heading">
          <h2 id="consumption-heading">Reservation consumption</h2>
          <ul>
            {existing.books.map((book) => (
              <li key={book._id}>
                {book.title}: {book.consumptionStatus}
                {book.consumedQuantity > 0
                  ? ` (${book.consumedQuantity} copies)`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
