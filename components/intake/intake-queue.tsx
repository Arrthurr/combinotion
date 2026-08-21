"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { PendingItem } from "./pending-item";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type Filter = "pending" | "invalid" | "resolved";

export function IntakeQueue() {
  if (!convexConfigured) {
    return (
      <section className="card stack" aria-labelledby="intake-queue-heading">
        <h2 id="intake-queue-heading">Pending intake</h2>
        <p className="muted" role="status">
          Connect Convex to review incoming form rows.
        </p>
      </section>
    );
  }
  return <IntakeQueueLive />;
}

function IntakeQueueLive() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [status, setStatus] = useState("");
  const items = useQuery(api.intake.listItems, { state: filter });
  const people = useQuery(api.people.listPeople);
  const schools = useQuery(api.schools.listSchools);
  const titles = useQuery(api.titles.listTitles);
  const health = useQuery(api.intake.listHealth);

  return (
    <section className="stack" aria-labelledby="intake-queue-heading">
      <h2 id="intake-queue-heading">Pending intake</h2>
      {health === undefined ? null : (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {health.map((feed) => (
            <li key={feed.kind}>
              {feed.kind === "bookReviews" ? "Book reviews" : "Donation applications"}
              {feed.message ? ` · ${feed.message}` : feed.enabled ? " · polling" : " · disabled"}
            </li>
          ))}
        </ul>
      )}
      <div className="row" role="group" aria-label="Intake filter">
        {(["pending", "invalid", "resolved"] as const).map((value) => (
          <button
            key={value}
            className="button"
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "pending"
              ? "Pending"
              : value === "invalid"
                ? "Invalid"
                : "Resolved"}
          </button>
        ))}
      </div>
      {items === undefined ||
      people === undefined ||
      schools === undefined ||
      titles === undefined ? (
        <p className="muted" role="status">
          Loading intake…
        </p>
      ) : items.length === 0 ? (
        <p className="muted">No {filter} form rows.</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {items.map((item) => (
            <PendingItem
              key={item.itemId}
              item={item}
              people={people}
              schools={schools}
              titles={titles}
              onStatus={setStatus}
            />
          ))}
        </ul>
      )}
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
