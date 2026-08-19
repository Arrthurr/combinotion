import { OperationsTimeline } from "@/components/views/operations-timeline";
import { TableView } from "@/components/views/table-view";
import { VisitBoard } from "@/components/views/visit-board";

export default function ViewsPage() {
  return (
    <main id="content" className="stack">
      <h1>Operations views</h1>
      <p>
        Review the catalog table, move visit plans through preparation, and
        read the operations chronology.
      </p>
      <TableView />
      <VisitBoard />
      <OperationsTimeline />
    </main>
  );
}
