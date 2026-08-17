"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export function BooksCatalog() {
  if (!convexConfigured) {
    return (
      <section className="card">
        <h2>Getting started</h2>
        <p>Your catalog will show title identity, available copies, and recent operational history here.</p>
      </section>
    );
  }
  return <BooksCatalogLive />;
}

function BooksCatalogLive() {
  const titles = useQuery(api.titles.listTitles);
  if (titles === undefined) return <p className="muted" role="status">Loading titles…</p>;
  if (titles.length === 0) return <p className="muted">No titles yet.</p>;
  return (
    <ul className="stack">
      {titles.map((title) => (
        <li key={title._id} className="card">
          <Link href={`/books/${title._id}`}>{title.title}</Link>
          <p className="muted">
            {title.author} · {title.isbn}
          </p>
        </li>
      ))}
    </ul>
  );
}
