import { PopularityReport } from "@/components/reports/popularity-report";

export default function ReportsPage() {
  return (
    <main id="content" className="stack">
      <h1>Book popularity</h1>
      <p>
        Compare independent request counts, donated copies, and average rubric
        scores.
      </p>
      <PopularityReport />
    </main>
  );
}
