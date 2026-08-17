import { ConvexHttpClient } from "convex/browser";
import { Suspense } from "react";
import { api } from "@/convex/_generated/api";
import { RequestableTitleList } from "@/components/requests/requestable-title-list";
import type { RequestableTitle } from "@/convex/titles";

export const dynamic = "force-dynamic";

async function RequestableBooks() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  let titles: RequestableTitle[] = [];
  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      titles = await client.query(api.titles.listRequestable, {});
    } catch {
      titles = [];
    }
  }

  return (
    <RequestableTitleList
      titles={titles}
      allowUnconfiguredEntry={
        !convexUrl &&
        process.env.NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS === "1"
      }
    />
  );
}

export default function RequestBooksPage() {
  return (
    <main id="content" className="stack">
      <div>
        <p className="muted">For schools</p>
        <h1>Request books</h1>
        <p>
          Choose titles that are currently available. Submitting this form
          reserves copies. It does not change fundraising-store inventory.
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
