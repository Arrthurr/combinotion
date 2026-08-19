"use client";

import { usePathname } from "next/navigation";
import { OperationsTimeline } from "@/components/views/operations-timeline";
import { TableView } from "@/components/views/table-view";
import { VisitBoard } from "@/components/views/visit-board";
import { VisitEditor } from "@/components/visits/visit-editor";

export function UnconfiguredStaff() {
  const pathname = usePathname();
  return (
    <main id="content" className="stack">
      <h1>Staff authentication is not configured</h1>
      <p>
        Add the Clerk environment values in <code>.env.local</code> before
        using the staff workspace.
      </p>
      {pathname.startsWith("/visits") ? <VisitEditor /> : null}
      {pathname.startsWith("/views") ? (
        <>
          <TableView />
          <VisitBoard />
          <OperationsTimeline />
        </>
      ) : null}
    </main>
  );
}
