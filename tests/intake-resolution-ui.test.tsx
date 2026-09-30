import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { describe, expect, it } from "vitest";
import { PendingItem } from "@/components/intake/pending-item";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

describe("intake resolution choices", () => {
  it("renders labelled person and school choices supplied by the server", () => {
    const item: FunctionReturnType<typeof api.intake.listItems>[number] = {
      itemId: "item" as Id<"intakeItems">,
      sourceId: "source",
      fingerprint: "v1",
      receivedAt: 1,
      rawPayloadPresent: false,
      suggestions: [],
      state: {
        kind: "pending",
        candidate: {
          kind: "donationApplication",
          name: "Ada",
          email: "ada@example.com",
        },
      },
      attachmentOptions: [
        {
          kind: "person",
          id: "person" as Id<"people">,
          label: "Person · Original Ada",
        },
        {
          kind: "school",
          id: "school" as Id<"schools">,
          label: "School · Joy School (2 Oak Street)",
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(ConvexProvider, {
        client: new ConvexReactClient("https://example.convex.cloud"),
        children: createElement(PendingItem, { item, onStatus: () => {} }),
      }),
    );
    expect(html).toContain('Existing person (optional)<select name="personId"');
    expect(html).toContain('Existing school (optional)<select name="schoolId"');
    expect(html).toContain(
      '<option value="person">Person · Original Ada</option>',
    );
    expect(html).toContain(
      '<option value="school">School · Joy School (2 Oak Street)</option>',
    );
    expect(html).toContain("Resolve donor from this row");
  });
});
