"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

export function StockHistory({ titleId }: { titleId: Id<"titles"> }) {
  if (!convexConfigured) {
    return (
      <p className="muted">
        Stock history will appear after Convex is configured.
      </p>
    );
  }
  return <StockHistoryLive titleId={titleId} />;
}

function StockHistoryLive({ titleId }: { titleId: Id<"titles"> }) {
  const movements = useQuery(api.inventory.listHistory, { titleId });

  if (movements === undefined) {
    return (
      <p className="muted" role="status">
        Loading stock history…
      </p>
    );
  }
  if (movements.length === 0) {
    return <p className="muted">No stock movements yet.</p>;
  }

  return (
    <ul className="stack">
      {movements.map((movement) => (
        <li key={movement._id}>
          <strong>{movement.kind}</strong>{" "}
          {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
          {movement.reason ? ` · ${movement.reason}` : ""}
          <br />
          <span className="muted">
            {new Date(movement.createdAt).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
