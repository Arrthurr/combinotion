import type { RequestableTitle } from "@/convex/titles";
import { CirclePause } from "lucide-react";
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
        <div className="empty-state" role="status">
          <span aria-hidden="true"><CirclePause size={23} /></span>
          <div>
            <strong>Requests are taking a short pause</strong>
            <p>{holdMessage}</p>
          </div>
        </div>
      ) : (
        <RequestForm
          titles={titles}
          allowUnconfiguredEntry={allowUnconfiguredEntry}
        />
      )}
    </section>
  );
}
