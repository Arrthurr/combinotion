import { z } from "zod";
import { SCHOOL_REQUEST_RATE_LIMIT_MESSAGE } from "./schoolRequestRateLimit";

const lineSchema = z.object({
  isbn: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive(),
});

const requestSchema = z
  .object({
    schoolName: z.string().trim().min(2),
    address: z.string().trim().min(5),
    contactName: z.string().trim().min(2),
    email: z.string().trim().email(),
    lines: z.array(lineSchema).min(1).optional(),
    isbn: z.string().trim().min(1).optional(),
    quantity: z.coerce.number().int().positive().optional(),
    website: z.string().optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.lines === undefined &&
      value.isbn === undefined &&
      value.quantity === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose at least one title",
      });
    }
    if (
      (value.isbn !== undefined || value.quantity !== undefined) &&
      (value.isbn === undefined || value.quantity === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ISBN and quantity must be provided together",
      });
    }
  })
  .transform((value) => ({
    schoolName: value.schoolName,
    address: value.address,
    contactName: value.contactName,
    email: value.email,
    lines: value.lines ?? [{ isbn: value.isbn!, quantity: value.quantity! }],
    ...(value.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: value.idempotencyKey }),
  }));

export function normalizeSchoolRequest(body: unknown) {
  return requestSchema.safeParse(body);
}

export function isSchoolRequestHoneypot(body: unknown) {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof Reflect.get(body, "website") === "string" &&
    Boolean(Reflect.get(body, "website"))
  );
}

export type SchoolRequestOutcome =
  | { kind: "submitted"; reference: string }
  | { kind: "invalid" }
  | { kind: "closed"; message: string }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "titleUnavailable" }
  | { kind: "copiesUnavailable" }
  | { kind: "duplicateTitle" }
  | { kind: "forbidden" }
  | { kind: "unavailable" };

export function schoolRequestResponse(outcome: SchoolRequestOutcome): Response {
  let status: number;
  let body: { reference: string } | { error: string };
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  switch (outcome.kind) {
    case "submitted":
      status = 201;
      body = { reference: outcome.reference };
      break;
    case "invalid":
      status = 400;
      body = { error: "Please correct the highlighted information." };
      break;
    case "closed":
      status = 503;
      body = { error: outcome.message };
      break;
    case "rateLimited":
      status = 429;
      body = { error: SCHOOL_REQUEST_RATE_LIMIT_MESSAGE };
      headers["Retry-After"] = String(outcome.retryAfterSeconds);
      break;
    case "titleUnavailable":
      status = 409;
      body = { error: "Title is not available" };
      break;
    case "copiesUnavailable":
      status = 409;
      body = { error: "Those copies are no longer available" };
      break;
    case "duplicateTitle":
      status = 400;
      body = { error: "A title can appear only once in a request" };
      break;
    case "forbidden":
    case "unavailable":
      status = outcome.kind === "forbidden" ? 403 : 503;
      body = { error: "Request service unavailable" };
      break;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

const forwardedResponseSchema = z.union([
  z.object({ reference: z.string() }),
  z.object({ error: z.string() }),
]);

// Validate the server-to-server response without coupling adapters to error text.
export async function forwardSchoolRequestResponse(response: Response) {
  const payload = forwardedResponseSchema.safeParse(await response.json());
  if (payload.success) {
    if (
      (response.status === 201 && "reference" in payload.data) ||
      ([400, 403, 409, 429, 503].includes(response.status) &&
        "error" in payload.data)
    ) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const retryAfter = response.headers.get("Retry-After");
      if (response.status === 429 && retryAfter)
        headers["Retry-After"] = retryAfter;
      return new Response(JSON.stringify(payload.data), {
        status: response.status,
        headers,
      });
    }
  }
  return schoolRequestResponse({ kind: "unavailable" });
}
