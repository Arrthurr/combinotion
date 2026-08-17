"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type RequestLineView = {
  reservationId: Id<"reservations">;
  titleId: Id<"titles">;
  titleName: string;
  isbn: string;
  quantity: number;
  shortage: boolean;
};

type RequestView = Doc<"schoolRequests"> & {
  lines: RequestLineView[];
  hasShortage: boolean;
};

function RequestCard({
  request,
  disabled,
  onResolve,
}: {
  request: RequestView;
  disabled: boolean;
  onResolve: (resolution: "cancelled" | "declined") => void;
}) {
  return (
    <article className="card stack">
      <div>
        <h3>{request.schoolName}</h3>
        <p className="muted">{request.schoolAddress}</p>
      </div>
      <p>
        {request.contactName} ·{" "}
        <a href={`mailto:${request.email}`}>{request.email}</a>
      </p>
      <div className="row">
        <span>Match: {request.matchStatus}</span>
        <span>
          Created {new Date(request.createdAt).toLocaleString()}
        </span>
      </div>
      <ul>
        {request.lines.map((line) => (
          <li key={line.reservationId}>
            {line.titleName} · {line.quantity} requested
            {line.shortage ? " · shortage" : ""}
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          className="button"
          type="button"
          disabled={disabled}
          onClick={() => onResolve("cancelled")}
        >
          Cancel
        </button>
        <button
          className="button"
          type="button"
          disabled={disabled}
          onClick={() => onResolve("declined")}
        >
          Decline
        </button>
      </div>
    </article>
  );
}

export function RequestQueue() {
  if (!convexConfigured) {
    return (
      <section className="card stack" aria-labelledby="requests-fallback">
        <h2 id="requests-fallback">School requests are not configured</h2>
        <p>
          Connect Convex to review active requests and reservation
          exceptions.
        </p>
      </section>
    );
  }
  return <RequestQueueLive />;
}

function RequestQueueLive() {
  const active = useQuery(api.schoolRequests.listActive);
  const requestExceptions = useQuery(api.schoolRequests.listExceptions);
  const visitExceptions = useQuery(api.visits.listConsumptionExceptions);
  const resolveRequest = useMutation(
    api.schoolRequests.resolveRequest,
  );
  const [status, setStatus] = useState("");
  const [pendingId, setPendingId] =
    useState<Id<"schoolRequests"> | null>(null);

  async function resolve(
    requestId: Id<"schoolRequests">,
    resolution: "cancelled" | "declined",
  ) {
    setPendingId(requestId);
    setStatus(
      resolution === "cancelled"
        ? "Cancelling request…"
        : "Declining request…",
    );
    try {
      await resolveRequest({ requestId, resolution });
      setStatus(
        resolution === "cancelled"
          ? "Request cancelled and reservations released."
          : "Request declined and reservations released.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not resolve request.",
      );
    } finally {
      setPendingId(null);
    }
  }

  if (
    active === undefined ||
    requestExceptions === undefined ||
    visitExceptions === undefined
  ) {
    return (
      <p className="muted" role="status">
        Loading school requests…
      </p>
    );
  }

  return (
    <>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
      <section className="stack" aria-labelledby="exceptions-heading">
        <h2 id="exceptions-heading">Request exceptions</h2>
        {requestExceptions.length === 0 && visitExceptions.length === 0 ? (
          <p className="muted">No request exceptions need review.</p>
        ) : (
          <ul className="card stack">
            {requestExceptions.map((request) => (
              <li key={request._id}>
                <strong>{request.schoolName}</strong> ·{" "}
                {request.matchStatus}
                {request.hasShortage
                  ? ` · shortage on ${request.lines
                      .filter((line) => line.shortage)
                      .map((line) => line.titleName)
                      .join(", ")}`
                  : ""}
              </li>
            ))}
            {visitExceptions.map((exception) => (
              <li key={exception._id}>
                <strong>{exception.schoolName}</strong> ·{" "}
                {exception.titleName} · ambiguous reservation match
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="stack" aria-labelledby="active-heading">
        <h2 id="active-heading">Active requests</h2>
        {active.length === 0 ? (
          <p className="muted">No active school requests.</p>
        ) : (
          <div className="stack">
            {active.map((request) => (
              <RequestCard
                key={request._id}
                request={request}
                disabled={pendingId === request._id}
                onResolve={(resolution) =>
                  resolve(request._id, resolution)
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
