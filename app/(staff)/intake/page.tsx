import { IntakeQueue } from "@/components/intake/intake-queue";

export default function IntakePage() {
  return (
    <main id="content" className="stack">
      <h1>Incoming forms</h1>
      <p>
        Unmatched Google Form rows stay here until they are attached, used to
        create a record, or dismissed.
      </p>
      <IntakeQueue />
    </main>
  );
}
