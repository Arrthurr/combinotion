"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { MovementKind } from "@/lib/domain/types";
import type { TimelineEvent } from "@/lib/domain/views";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const DAY_MS = 86_400_000;

function defaultWindow() {
  const now = Date.now();
  return {
    from: now - 180 * DAY_MS,
    to: now + 90 * DAY_MS,
  };
}

function dateInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function timestampFromDateInput(value: string, endOfDay: boolean) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return endOfDay ? timestamp + DAY_MS - 1 : timestamp;
}

function movementKindLabel(kind: MovementKind) {
  switch (kind) {
    case "openingBalance":
      return "Opening balance";
    case "receipt":
      return "Receipt";
    case "adjustment":
      return "Adjustment";
    case "donation":
      return "Donation";
    case "reservation":
      return "Reservation";
    case "release":
      return "Release";
    case "reservationConsumption":
      return "Reservation consumption";
    default: {
      const unhandledKind: never = kind;
      throw new Error(`Unhandled movement kind: ${unhandledKind}`);
    }
  }
}

function dayHeading(at: number) {
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function TimelineEventItem({
  event,
}: {
  event: TimelineEvent<string, string, string>;
}) {
  switch (event.kind) {
    case "orderPlaced":
      return (
        <li>
          <Link href="/orders">{event.supplierName}</Link>
          {" placed an order for "}
          {event.titleCount} titles
        </li>
      );
    case "expectedDelivery":
      return (
        <li>
          Expected delivery from{" "}
          <Link href="/orders">{event.supplierName}</Link>
          {` · ${event.outstandingQuantity} outstanding`}
        </li>
      );
    case "movement":
      return (
        <li>
          {movementKindLabel(event.movementKind)}{" "}
          {event.quantity > 0 ? `+${event.quantity}` : event.quantity}{" "}
          <Link href={`/books/${event.titleId}`}>{event.titleName}</Link>
          {event.reason === undefined ? "" : ` · ${event.reason}`}
        </li>
      );
    case "visitOccurred":
      return (
        <li>
          Visit at{" "}
          <Link href={`/visits/${event.visitId}`}>{event.schoolName}</Link>
          {` · ${event.donatedQuantity} copies donated`}
        </li>
      );
    default: {
      const unhandledEvent: never = event;
      throw new Error(`Unhandled timeline event: ${unhandledEvent}`);
    }
  }
}

function OperationsTimelineFallback() {
  return (
    <section className="card stack" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">Timeline</h2>
      <p>See order, expected delivery, and receipt dates in one chronology.</p>
    </section>
  );
}

export function OperationsTimeline() {
  if (!convexConfigured) {
    return <OperationsTimelineFallback />;
  }
  return <OperationsTimelineLive />;
}

function OperationsTimelineLive() {
  const initial = useMemo(() => defaultWindow(), []);
  const [fromInput, setFromInput] = useState(dateInputValue(initial.from));
  const [toInput, setToInput] = useState(dateInputValue(initial.to));
  const [window, setWindow] = useState(initial);
  const [status, setStatus] = useState("");
  const timeline = useQuery(api.views.listTimeline, { window });

  function applyWindow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = timestampFromDateInput(fromInput, false);
    const to = timestampFromDateInput(toInput, true);
    if (from === undefined || to === undefined || from > to) {
      setStatus("Choose an ordered start and end date.");
      return;
    }
    setWindow({ from, to });
    setStatus("Timeline window updated.");
  }

  const days =
    timeline === undefined
      ? []
      : timeline.events.reduce<{ day: string; events: typeof timeline.events }[]>(
          (groups, event) => {
            const day = dayHeading(event.at);
            const last = groups[groups.length - 1];
            if (last && last.day === day) {
              last.events.push(event);
              return groups;
            }
            groups.push({ day, events: [event] });
            return groups;
          },
          [],
        );

  return (
    <section className="card stack" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading">Timeline</h2>
      <form className="stack" onSubmit={applyWindow}>
        <div className="row">
          <label>
            From
            <input
              type="date"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
            />
          </label>
          <button className="button">Update window</button>
        </div>
      </form>
      {timeline === undefined ? (
        <p className="muted" role="status">
          Loading timeline…
        </p>
      ) : timeline.events.length === 0 ? (
        <p className="muted">No operations in this window.</p>
      ) : (
        <div className="stack">
          {days.map((group) => (
            <section key={group.day} className="stack">
              <h3>{group.day}</h3>
              <ul className="stack">
                {group.events.map((event) => (
                  <TimelineEventItem
                    key={`${event.kind}-${event.at}-${
                      event.kind === "movement"
                        ? event.movementId
                        : event.kind === "visitOccurred"
                          ? event.visitId
                          : event.orderId
                    }`}
                    event={event}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {timeline?.truncated ? (
        <p className="muted">Showing the newest 200 events in this window.</p>
      ) : null}
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
