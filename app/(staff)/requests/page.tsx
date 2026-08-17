import { RequestQueue } from "@/components/requests/request-queue";

export default function RequestsPage() {
  return (
    <main id="content" className="stack">
      <h1>School requests</h1>
      <p className="muted">
        Active requests are ordered by age. Declining or cancelling one
        releases its reservations.
      </p>
      <RequestQueue />
    </main>
  );
}
