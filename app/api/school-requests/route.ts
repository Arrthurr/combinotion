import { NextResponse } from "next/server";
import {
  forwardSchoolRequestResponse,
  isSchoolRequestHoneypot,
  normalizeSchoolRequest,
  schoolRequestResponse,
} from "@/lib/schoolRequestSubmission";

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
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, ".convex.site");
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return schoolRequestResponse({ kind: "invalid" });
  }
  if (isSchoolRequestHoneypot(body)) {
    return NextResponse.json({ reference: "JFB-RECEIVED" });
  }
  const parsed = normalizeSchoolRequest(body);
  if (!parsed.success) {
    return schoolRequestResponse({ kind: "invalid" });
  }

  const siteUrl = convexSiteUrl();
  const sharedSecret = process.env.SCHOOL_REQUEST_SHARED_SECRET;
  if (!siteUrl || !sharedSecret) {
    return schoolRequestResponse({ kind: "unavailable" });
  }
  try {
    const response = await fetch(`${siteUrl}/school-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-school-request-secret": sharedSecret,
      },
      body: JSON.stringify(parsed.data),
    });
    return await forwardSchoolRequestResponse(response);
  } catch {
    return schoolRequestResponse({ kind: "unavailable" });
  }
}
