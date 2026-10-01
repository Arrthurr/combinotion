import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  normalizeSchoolRequest,
  schoolRequestResponse,
} from "../lib/schoolRequestSubmission";

const http = httpRouter();

http.route({
  path: "/school-requests",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const sharedSecret = process.env.SCHOOL_REQUEST_SHARED_SECRET;
    if (
      !sharedSecret ||
      request.headers.get("x-school-request-secret") !== sharedSecret
    ) {
      return schoolRequestResponse({ kind: "forbidden" });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return schoolRequestResponse({ kind: "invalid" });
    }
    const parsed = normalizeSchoolRequest(body);
    if (!parsed.success) {
      return schoolRequestResponse({ kind: "invalid" });
    }
    try {
      const outcome = await ctx.runMutation(
        internal.schoolRequests.internalSubmit,
        parsed.data,
      );
      return schoolRequestResponse(outcome);
    } catch {
      return schoolRequestResponse({ kind: "unavailable" });
    }
  }),
});

export default http;
