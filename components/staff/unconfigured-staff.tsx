"use client";

import { usePathname } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PopularityReport } from "@/components/reports/popularity-report";
import { ReviewModeration } from "@/components/reviews/review-moderation";
import { OperationsTimeline } from "@/components/views/operations-timeline";
import { TableView } from "@/components/views/table-view";
import { VisitBoard } from "@/components/views/visit-board";
import { VisitEditor } from "@/components/visits/visit-editor";

export function UnconfiguredStaff() {
  const pathname = usePathname();
  return (
    <main id="content" className="unconfigured-page stack">
      <Link className="brand brand-dark" href="/">
        <span className="brand-mark" aria-hidden="true"><ShieldCheck size={21} /></span>
        <span><strong>Joy for Books</strong><small>Operations</small></span>
      </Link>
      <section className="setup-notice">
        <span className="setup-icon" aria-hidden="true"><KeyRound size={23} /></span>
        <div>
          <p className="eyebrow">Protected workspace</p>
          <h1>Staff authentication is not configured</h1>
          <p>
            Add the Clerk environment values in <code>.env.local</code> before
            using the staff workspace.
          </p>
        </div>
      </section>
      {pathname.startsWith("/reviews") ? <ReviewModeration /> : null}
      {pathname.startsWith("/reports") ? <PopularityReport /> : null}
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
