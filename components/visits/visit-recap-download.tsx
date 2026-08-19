"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function VisitRecapDownloadFallback() {
  return (
    <section className="card stack" aria-labelledby="visit-recap-heading">
      <h2 id="visit-recap-heading">Visit recap</h2>
      <button className="button" disabled>
        Download recap PDF
      </button>
      <p className="muted" role="status">
        Connect Convex to generate visit recaps.
      </p>
    </section>
  );
}

export function VisitRecapDownload({
  visitId,
}: {
  visitId: Id<"visits">;
}) {
  if (!convexConfigured) {
    return <VisitRecapDownloadFallback />;
  }
  return <VisitRecapDownloadLive visitId={visitId} />;
}

function VisitRecapDownloadLive({
  visitId,
}: {
  visitId: Id<"visits">;
}) {
  const generateRecap = useAction(api.visitRecaps.generateRecap);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function download() {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus("Generating recap…");
    try {
      const recap = await generateRecap({ visitId });
      const url = URL.createObjectURL(
        new Blob([recap.bytes], { type: recap.mimeType }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = recap.fileName;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Visit recap downloaded.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not generate recap.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="visit-recap-heading">
      <h2 id="visit-recap-heading">Visit recap</h2>
      <p>
        Generate a shareable PDF from the school, people, books, quantities,
        and follow-up recorded for this visit.
      </p>
      <button
        className="button"
        disabled={busy}
        type="button"
        onClick={download}
      >
        {busy ? "Generating recap…" : "Download recap PDF"}
      </button>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
