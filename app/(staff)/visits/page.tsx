import { VisitEditor } from "@/components/visits/visit-editor";
import { VisitList } from "@/components/visits/visit-list";

export default function VisitsPage() {
  return (
    <main id="content" className="stack">
      <h1>School visits</h1>
      <p>
        Log a visit with its school, readers, books read, donations, and
        follow-up details.
      </p>
      <section className="stack" aria-labelledby="new-visit-heading">
        <h2 id="new-visit-heading">Record a visit</h2>
        <VisitEditor />
      </section>
      <VisitList />
    </main>
  );
}
