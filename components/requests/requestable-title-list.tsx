import type { RequestableTitle } from "@/convex/titles";
import { RequestForm } from "./request-form";

export function RequestableTitleList({
  titles,
  allowUnconfiguredEntry = false,
  holdMessage,
}: {
  titles: RequestableTitle[];
  allowUnconfiguredEntry?: boolean;
  holdMessage?: string;
}) {
  return (
    <section className="stack" aria-labelledby="requestable-titles">
      <h2 id="requestable-titles">Available titles</h2>
      {holdMessage ? (
        <p role="status">{holdMessage}</p>
      ) : (
        <RequestForm
          titles={titles}
          allowUnconfiguredEntry={allowUnconfiguredEntry}
        />
      )}
    </section>
  );
}
