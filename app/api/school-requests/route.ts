import { NextResponse } from "next/server";
import { z } from "zod";

const lineSchema = z.object({
  isbn: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

const requestSchema = z
  .object({
    schoolName: z.string().min(2),
    address: z.string().min(5),
    contactName: z.string().min(2),
    email: z.string().email(),
    lines: z.array(lineSchema).min(1).optional(),
    isbn: z.string().min(1).optional(),
    quantity: z.coerce.number().int().positive().optional(),
    website: z.string().optional(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasLegacyValue =
      value.isbn !== undefined || value.quantity !== undefined;
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
      hasLegacyValue &&
      (value.isbn === undefined || value.quantity === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ISBN and quantity must be provided together",
      });
    }
  });

const forwardedResponseSchema = z.union([
  z.object({ reference: z.string() }),
  z.object({ error: z.string() }),
]);

function requestServiceUnavailable() {
  return NextResponse.json(
    { error: "Request service unavailable" },
    { status: 503 },
  );
}

function convexSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!deploymentUrl) {
    return null;
  }
  try {
    const url = new URL(deploymentUrl);
    url.hostname = url.hostname.replace(
      /\.convex\.cloud$/,
      ".convex.site",
    );
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Please correct the highlighted information." },
      { status: 400 },
    );
  }
  if (
    typeof rawBody === "object" &&
    rawBody !== null &&
    typeof Reflect.get(rawBody, "website") === "string" &&
    Reflect.get(rawBody, "website")
  ) {
    return NextResponse.json({ reference: "JFB-RECEIVED" });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please correct the highlighted information." },
      { status: 400 },
    );
  }
  if (parsed.data.website) {
    return NextResponse.json({ reference: "JFB-RECEIVED" });
  }

  const siteUrl = convexSiteUrl();
  const sharedSecret = process.env.SCHOOL_REQUEST_SHARED_SECRET;
  if (!siteUrl || !sharedSecret) {
    return requestServiceUnavailable();
  }
  const lines =
    parsed.data.lines ??
    (parsed.data.isbn === undefined ||
    parsed.data.quantity === undefined
      ? []
      : [
          {
            isbn: parsed.data.isbn,
            quantity: parsed.data.quantity,
          },
        ]);

  try {
    const response = await fetch(`${siteUrl}/school-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-school-request-secret": sharedSecret,
      },
      body: JSON.stringify({
        schoolName: parsed.data.schoolName,
        address: parsed.data.address,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        lines,
        ...(parsed.data.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: parsed.data.idempotencyKey }),
      }),
    });
    const payload = forwardedResponseSchema.safeParse(
      await response.json(),
    );
    if (!payload.success) {
      return requestServiceUnavailable();
    }
    if (response.status === 201 && "reference" in payload.data) {
      return NextResponse.json(
        { reference: payload.data.reference },
        { status: 201 },
      );
    }
    if (
      (response.status === 400 ||
        response.status === 403 ||
        response.status === 409 ||
        response.status === 503) &&
      "error" in payload.data
    ) {
      return NextResponse.json(
        { error: payload.data.error },
        { status: response.status },
      );
    }
    return requestServiceUnavailable();
  } catch {
    return requestServiceUnavailable();
  }
}
