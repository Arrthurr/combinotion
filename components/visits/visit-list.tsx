"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export function VisitList() {
  if (!convexConfigured) {
    return (
      <section className="card stack">
        <h2>Visit history is not configured</h2>
        <p>Connect Convex to list visits and reservation exceptions.</p>
      </section>
    );
  }
  return <VisitListLive />;
}

function VisitListLive() {
  const visits = useQuery(api.visits.listVisits);
  const exceptions = useQuery(api.visits.listConsumptionExceptions);

  if (visits === undefined || exceptions === undefined) {
    return (
      <p className="muted" role="status">
        Loading visits…
      </p>
    );
  }

  return (
    <>
      <section className="stack" aria-labelledby="visit-exceptions-heading">
        <h2 id="visit-exceptions-heading">Visit exceptions</h2>
        {exceptions.length === 0 ? (
          <p className="muted">
            No ambiguous reservation matches need review.
          </p>
        ) : (
          <ul className="card stack">
            {exceptions.map((exception) => (
              <li key={exception._id}>
                <Link href={`/visits/${exception.visitId}`}>
                  {exception.schoolName}
                </Link>
                {" · "}
                {exception.titleName} · ambiguous reservation match
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="stack" aria-labelledby="visit-history-heading">
        <h2 id="visit-history-heading">Visit history</h2>
        {visits.length === 0 ? (
          <p className="muted">No visits recorded yet.</p>
        ) : (
          <ul className="stack">
            {visits.map((visit) => (
              <li className="card" key={visit._id}>
                <h3>
                  <Link href={`/visits/${visit._id}`}>
                    {visit.schoolName}
                  </Link>
                </h3>
                <p>{new Date(visit.occurredAt).toLocaleDateString()}</p>
                <p className="muted">
                  {visit.readerCount} readers · {visit.donatedQuantity} copies
                  donated
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
