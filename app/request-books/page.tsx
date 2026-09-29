import { ConvexHttpClient } from "convex/browser";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { RequestableTitleList } from "@/components/requests/requestable-title-list";
import type { RequestableTitle } from "@/convex/titles";
import { publicRequestsHoldMessage } from "@/lib/domain/orgSettings";

export const dynamic = "force-dynamic";

async function RequestableBooks() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  let titles: RequestableTitle[] = [];
  let holdMessage: string | undefined;
  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      const gate = await client.query(api.orgSettings.publicRequestGate, {});
      holdMessage = publicRequestsHoldMessage(gate.publicRequests);
      if (holdMessage === undefined) {
        titles = await client.query(api.titles.listRequestable, {});
      }
    } catch {
      titles = [];
    }
  }

  return (
    <RequestableTitleList
      titles={titles}
      holdMessage={holdMessage}
      allowUnconfiguredEntry={
        !convexUrl &&
        process.env.NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS === "1"
      }
    />
  );
}

export default function RequestBooksPage() {
  return (
    <main id="content" className="request-page stack">
      <nav className="public-nav" aria-label="Request page navigation">
        <span className="brand brand-dark">
          <span className="brand-mark" aria-hidden="true"><BookOpen size={21} /></span>
          <span><strong>Joy for Books</strong><small>School requests</small></span>
        </span>
      </nav>
      <div className="page-intro">
        <p className="eyebrow">For Arizona schools</p>
        <h1>Request books</h1>
        <p>
          Choose from the titles currently on our shelves. Submitting a request
          reserves copies for your school.
        </p>
      </div>
      <Suspense
        fallback={
          <p role="status" aria-live="polite">
            Loading titles…
          </p>
        }
      >
        <RequestableBooks />
      </Suspense>
    </main>
  );
}
