import type { RequestableTitle } from "@/convex/titles";
import { RequestForm } from "./request-form";

export function RequestableTitleList({
  titles,
  allowUnconfiguredEntry = false,
}: {
  titles: RequestableTitle[];
  allowUnconfiguredEntry?: boolean;
}) {
  return (
    <section className="stack" aria-labelledby="requestable-titles">
      <h2 id="requestable-titles">Available titles</h2>
      <RequestForm
        titles={titles}
        allowUnconfiguredEntry={allowUnconfiguredEntry}
      />
    </section>
  );
}
