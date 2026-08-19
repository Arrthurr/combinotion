import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  renderVisitRecapPdf,
  visitRecapFilename,
} from "../lib/exports/visit-recap";

export type GenerateRecapResult = {
  fileName: string;
  mimeType: "application/pdf";
  bytes: ArrayBuffer;
};

export const generateRecap = action({
  args: {
    visitId: v.id("visits"),
  },
  handler: async (ctx, { visitId }): Promise<GenerateRecapResult> => {
    await ctx.runQuery(internal.staff.assertStaff, {});
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
