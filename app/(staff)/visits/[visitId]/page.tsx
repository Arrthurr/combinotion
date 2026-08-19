import type { Id } from "@/convex/_generated/dataModel";
import { VisitEditor } from "@/components/visits/visit-editor";
import { VisitRecapDownload } from "@/components/visits/visit-recap-download";

export default async function VisitPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const typedVisitId = visitId as Id<"visits">;
  return (
    <main id="content" className="stack">
      <h1>Visit details</h1>
      <p>Review the recap data, update the visit, or delete it.</p>
      <VisitEditor visitId={typedVisitId} />
      <VisitRecapDownload visitId={typedVisitId} />
    </main>
  );
}
