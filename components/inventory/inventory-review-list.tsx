"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { InventoryReview } from "@/lib/domain/types";
import { StockHistory } from "./stock-history";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type ReviewTitle = Doc<"titles"> & InventoryReview;

function TitleReviewCard({ title }: { title: ReviewTitle }) {
  const markReorderNeeded = useMutation(api.inventory.markReorderNeeded);
  const correctOnHand = useMutation(api.inventory.correctOnHand);
  const recordOpeningBalance = useMutation(
    api.inventory.recordOpeningBalance,
  );
  const movements = useQuery(api.inventory.listHistory, {
    titleId: title._id,
  });
  const [status, setStatus] = useState("");
  const canRecordOpening =
    title.quantityOnHand === 0 &&
    movements !== undefined &&
    movements.length === 0;

  async function markForReorder() {
    setStatus("Marking reorder needed…");
    try {
      await markReorderNeeded({ titleId: title._id, needed: true });
      setStatus("Reorder marked as needed.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not update reorder.",
      );
    }
  }

  async function correct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Saving correction…");
    try {
      await correctOnHand({
        titleId: title._id,
        quantityOnHand: Number(data.get("quantityOnHand")),
        reason: String(data.get("reason") ?? ""),
      });
      form.reset();
      setStatus("On-hand quantity corrected.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save correction.",
      );
    }
  }

  async function recordOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Saving opening balance…");
    try {
      await recordOpeningBalance({
        titleId: title._id,
        quantity: Number(data.get("quantity")),
        reason: String(data.get("reason") ?? ""),
      });
      form.reset();
      setStatus("Opening balance recorded.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not save opening balance.",
      );
    }
  }

  return (
    <article className="card stack">
      <div>
        <h3>
          <Link href={`/books/${title._id}`}>{title.title}</Link>
        </h3>
        <p className="muted">{title.author}</p>
      </div>
      <div className="row">
        <span>On hand: {title.quantityOnHand}</span>
        <span>Reserved: {title.activeReservedQuantity}</span>
        <span>Available: {title.availableQuantity}</span>
      </div>
      <div className="row" aria-label="Inventory flags">
        {title.shortage ? <strong>Shortage</strong> : null}
        {title.lowStock ? <strong>Low stock</strong> : null}
        {title.reorderNeeded ? <strong>Reorder needed</strong> : null}
        {!title.shortage && !title.lowStock && !title.reorderNeeded ? (
          <span className="muted">Stock level healthy</span>
        ) : null}
      </div>
      <button
        className="button"
        type="button"
        disabled={title.reorderNeeded}
        onClick={markForReorder}
      >
        {title.reorderNeeded ? "Reorder needed" : "Mark reorder needed"}
      </button>
      {movements !== undefined && !canRecordOpening ? (
        <form className="stack" onSubmit={correct}>
          <h4>Correct on-hand quantity</h4>
          <label>
            New on-hand quantity
            <input
              required
              min="0"
              step="1"
              name="quantityOnHand"
              type="number"
            />
          </label>
          <label>
            Reason
            <input required name="reason" />
          </label>
          <button className="button">Save correction</button>
        </form>
      ) : null}
      {canRecordOpening ? (
        <form className="stack" onSubmit={recordOpening}>
          <h4>Record opening balance</h4>
          <label>
            Opening quantity
            <input required min="1" step="1" name="quantity" type="number" />
          </label>
          <label>
            Reason
            <input required name="reason" />
          </label>
          <button className="button">Save opening balance</button>
        </form>
      ) : null}
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
      <details>
        <summary>Stock history</summary>
        <StockHistory titleId={title._id} />
      </details>
    </article>
  );
}

export function InventoryReviewList() {
  if (!convexConfigured) {
    return (
      <section className="card stack" aria-labelledby="inventory-fallback">
        <h2 id="inventory-fallback">Inventory review is not configured</h2>
        <p>
          Connect Convex to review shortages, stock levels, and movement
          history.
        </p>
      </section>
    );
  }
  return <InventoryReviewListLive />;
}

function InventoryReviewListLive() {
  const titles = useQuery(api.inventory.listReview);

  if (titles === undefined) {
    return (
      <p className="muted" role="status">
        Loading inventory…
      </p>
    );
  }

  const shortages = titles.filter((title) => title.shortage);
  return (
    <>
      <section className="stack" aria-labelledby="shortage-heading">
        <h2 id="shortage-heading">Shortage exceptions</h2>
        {shortages.length === 0 ? (
          <p className="muted">No titles have more reserved than on hand.</p>
        ) : (
          <ul className="card stack">
            {shortages.map((title) => (
              <li key={title._id}>
                <Link href={`/books/${title._id}`}>{title.title}</Link>
                {" · "}
                {title.quantityOnHand} on hand,{" "}
                {title.activeReservedQuantity} reserved
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="stack" aria-labelledby="review-heading">
        <h2 id="review-heading">Title stock</h2>
        {titles.length === 0 ? (
          <p className="muted">No titles are available to review.</p>
        ) : (
          <div className="stack">
            {titles.map((title) => (
              <TitleReviewCard key={title._id} title={title} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
