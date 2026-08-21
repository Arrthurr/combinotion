import { httpRouter } from "convex/server";
import { z } from "zod";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  publicRequestsHoldMessage,
  type PublicRequests,
} from "../lib/domain/orgSettings";

const requestSchema = z.object({
  schoolName: z.string().min(2),
  address: z.string().min(5),
  contactName: z.string().min(2),
  email: z.string().email(),
  lines: z
    .array(
      z.object({
        isbn: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  idempotencyKey: z.string().min(1).optional(),
});

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Invalid request";
}

function closedResponse(publicRequests: PublicRequests) {
  const hold = publicRequestsHoldMessage(publicRequests);
  return hold === undefined ? null : json({ error: hold }, 503);
}

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
      return json({ error: "Request service unavailable" }, 403);
    }

    try {
      const gate = await ctx.runQuery(api.orgSettings.publicRequestGate, {});
      const closed = closedResponse(gate.publicRequests);
      if (closed) {
        return closed;
      }
      const body = requestSchema.parse(await request.json());
      const result = await ctx.runMutation(
        internal.schoolRequests.internalSubmit,
        body,
      );
      return json(result, 201);
    } catch (error) {
      const gate = await ctx.runQuery(api.orgSettings.publicRequestGate, {});
      const closed = closedResponse(gate.publicRequests);
      if (closed) {
        return closed;
      }
      const message = errorMessage(error);
      if (message.includes("Those copies are no longer available")) {
        return json(
          { error: "Those copies are no longer available" },
          409,
        );
      }
      if (message.includes("Title is not available")) {
        return json({ error: "Title is not available" }, 409);
      }
      return json({ error: message }, 400);
    }
  }),
});

export default http;
