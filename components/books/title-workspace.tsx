"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TitleWorkspace as TitleWorkspaceData } from "@/convex/titles";
import { StockHistory } from "@/components/inventory/stock-history";
import { TitleForm } from "./title-form";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function orderStatusLabel(status: TitleWorkspaceData["openOrderLines"][number]["status"]) {
  switch (status) {
    case "needed":
      return "Needed";
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    default: {
      const unhandledStatus: never = status;
      throw new Error(`Unhandled order status: ${unhandledStatus}`);
    }
  }
}

function TitleWorkspaceFallback() {
  return (
    <>
      <h1>Title workspace</h1>
      <p className="muted">
        Title identity, stock, requests, and visit history will appear after
        Convex is configured.
      </p>
      <section className="card stack">
        <h2>Inventory</h2>
        <p>On hand, reserved, availability, and an auditable movement history appear together.</p>
      </section>
      <section className="card stack">
        <h2>Requests and visits</h2>
        <p>Reservations and school visit donations use the same canonical title record.</p>
      </section>
      <section className="card stack">
        <h2>Reviews</h2>
        <p>Reader reviews for this title will appear here.</p>
      </section>
      <section className="card stack">
        <h2>Suppliers and orders</h2>
        <p>Open supplier orders for this title will appear here.</p>
      </section>
    </>
  );
}

export function TitleWorkspace({ titleId }: { titleId: Id<"titles"> }) {
  if (!convexConfigured) {
    return <TitleWorkspaceFallback />;
  }
  return <TitleWorkspaceLive titleId={titleId} />;
}

function TitleWorkspaceLive({ titleId }: { titleId: Id<"titles"> }) {
  const workspace = useQuery(api.titles.getTitleWorkspace, { titleId });
  const markReorderNeeded = useMutation(api.inventory.markReorderNeeded);
  const [status, setStatus] = useState("");

  if (workspace === undefined) {
    return (
      <p className="muted" role="status">
        Loading title…
      </p>
    );
  }
  if (workspace === null) {
    return (
      <>
        <h1>Title workspace</h1>
        <p className="muted">Title not found.</p>
      </>
    );
  }

  const title = workspace;

  async function toggleReorder() {
    setStatus(
      title.stock.reorderNeeded
        ? "Clearing reorder needed…"
        : "Marking reorder needed…",
    );
    try {
      await markReorderNeeded({
        titleId: title.titleId,
        needed: !title.stock.reorderNeeded,
      });
      setStatus(
        title.stock.reorderNeeded
          ? "Reorder cleared."
          : "Reorder marked as needed.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not update reorder.",
      );
    }
  }

  return (
    <>
      <h1>{workspace.identity.title}</h1>
      <p className="muted">
        {workspace.identity.author} · {workspace.identity.isbn}
      </p>
      {workspace.identity.coverUrl ? (
        <img
          alt=""
          src={workspace.identity.coverUrl}
          style={{ maxWidth: "8rem" }}
        />
      ) : null}
      <section className="stack" aria-labelledby="title-identity-heading">
        <h2 id="title-identity-heading">Catalog</h2>
        <TitleForm
          mode={{
            kind: "edit",
            titleId: workspace.titleId,
            initial: {
              title: workspace.identity.title,
              author: workspace.identity.author,
              isbn: workspace.identity.isbn,
              synopsis: workspace.identity.synopsis ?? "",
              notes: workspace.identity.notes ?? "",
              coverUrl: workspace.identity.coverUrl ?? "",
              purchaseInfo: workspace.identity.purchaseInfo ?? "",
              supplierIds: workspace.suppliers.map(
                (supplier) => supplier.supplierId,
              ),
            },
          }}
        />
      </section>
      <section className="card stack" aria-labelledby="title-inventory-heading">
        <h2 id="title-inventory-heading">Inventory</h2>
        <div className="row">
          <span>On hand: {workspace.stock.quantityOnHand}</span>
          <span>Reserved: {workspace.stock.activeReservedQuantity}</span>
          <span>Available: {workspace.stock.availableQuantity}</span>
        </div>
        <div className="row" aria-label="Inventory flags">
          {workspace.stock.shortage ? <strong>Shortage</strong> : null}
          {workspace.stock.lowStock ? <strong>Low stock</strong> : null}
          {workspace.stock.reorderNeeded ? <strong>Reorder needed</strong> : null}
          {!workspace.stock.shortage &&
          !workspace.stock.lowStock &&
          !workspace.stock.reorderNeeded ? (
            <span className="muted">Stock level healthy</span>
          ) : null}
        </div>
        <button className="button" type="button" onClick={() => void toggleReorder()}>
          {workspace.stock.reorderNeeded
            ? "Clear reorder needed"
            : "Mark reorder needed"}
        </button>
        <p className="muted" role="status" aria-live="polite">
          {status}
        </p>
        <h3>Stock history</h3>
        <StockHistory titleId={workspace.titleId} />
      </section>
      <section className="card stack" aria-labelledby="title-requests-heading">
        <h2 id="title-requests-heading">Requests and visits</h2>
        {workspace.activeRequests.length === 0 ? (
          <p className="muted">No active reservations for this title.</p>
        ) : (
          <ul className="stack">
            {workspace.activeRequests.map((request) => (
              <li key={request.requestId}>
                <Link href="/requests">{request.reference}</Link>
                {" · "}
                {request.schoolName} · {request.quantity} reserved
              </li>
            ))}
          </ul>
        )}
        <p>
          Read aloud {workspace.participation.readAloudCount} times ·{" "}
          {workspace.participation.donatedQuantity} copies donated
        </p>
      </section>
      <section className="card stack" aria-labelledby="title-reviews-heading">
        <h2 id="title-reviews-heading">Reviews</h2>
        {workspace.reviews.length === 0 ? (
          <p className="muted">No reviews yet.</p>
        ) : (
          <ul className="stack">
            {workspace.reviews.map((review) => (
              <li key={review.reviewId}>
                <strong>{review.reviewer}</strong> · {review.score}
                {review.approved ? " · Approved" : ""}
                <p>{review.feedback}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card stack" aria-labelledby="title-suppliers-heading">
        <h2 id="title-suppliers-heading">Suppliers and orders</h2>
        {workspace.suppliers.length === 0 ? (
          <p className="muted">No suppliers linked to this title.</p>
        ) : (
          <ul>
            {workspace.suppliers.map((supplier) => (
              <li key={supplier.supplierId}>{supplier.name}</li>
            ))}
          </ul>
        )}
        {workspace.openOrderLines.length === 0 ? (
          <p className="muted">No open order lines for this title.</p>
        ) : (
          <ul className="stack">
            {workspace.openOrderLines.map((line) => (
              <li key={`${line.orderId}-${line.supplierName}`}>
                <Link href="/orders">{line.supplierName}</Link>
                {" · "}
                {orderStatusLabel(line.status)} · {line.outstandingQuantity}{" "}
                outstanding
                {line.expectedAt === undefined
                  ? ""
                  : ` · expected ${new Date(line.expectedAt).toLocaleDateString()}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
