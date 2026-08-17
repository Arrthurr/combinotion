import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/school-requests/route";

function request(body: object) {
  return new Request("http://localhost/api/school-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const contact = {
  schoolName: "Joy School",
  address: "1 Main Street",
  contactName: "Pat Reader",
  email: "pat@example.com",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("school request route", () => {
  it("short-circuits the honeypot without a Convex write", async () => {
    const response = await POST(
      request({
        website: "https://spam.example",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reference: "JFB-RECEIVED",
    });
  });

  it("returns 503 for a legacy request without a Convex URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "");
    vi.stubEnv("SCHOOL_REQUEST_SHARED_SECRET", "secret");
    const response = await POST(
      request({ ...contact, isbn: "1", quantity: 2 }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Request service unavailable",
    });
  });

  it("never invents a reference when Convex is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "");
    vi.stubEnv("SCHOOL_REQUEST_SHARED_SECRET", "secret");
    const response = await POST(
      request({
        ...contact,
        lines: [{ isbn: "1", quantity: 2 }],
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Request service unavailable",
    });
  });

  it("adds the shared secret only when forwarding to Convex", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "https://example.convex.site",
    );
    vi.stubEnv("SCHOOL_REQUEST_SHARED_SECRET", "server-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reference: "JFB-TEST1234" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      request({
        ...contact,
        lines: [{ isbn: "1", quantity: 2 }],
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      reference: "JFB-TEST1234",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.convex.site/school-requests",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          "x-school-request-secret": "server-secret",
        },
      }),
    );
  });
});
