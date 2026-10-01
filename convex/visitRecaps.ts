import { v } from "convex/values";
import { api } from "./_generated/api";
import { staffAction } from "./lib/auth";
import {
  renderVisitRecapPdf,
  visitRecapFilename,
} from "../lib/exports/visit-recap";

export type GenerateRecapResult = {
  fileName: string;
  mimeType: "application/pdf";
  bytes: ArrayBuffer;
};

export const generateRecap = staffAction({
  args: {
    visitId: v.id("visits"),
  },
  handler: async (ctx, { visitId }): Promise<GenerateRecapResult> => {
    const visit = await ctx.runQuery(api.visits.getVisit, { visitId });
    if (!visit) {
      throw new Error("Visit not found");
    }
    const pdf = await renderVisitRecapPdf(visit);
    const bytes = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(bytes).set(pdf);
    return {
      fileName: visitRecapFilename(visit),
      mimeType: "application/pdf",
      bytes,
    };
  },
});
