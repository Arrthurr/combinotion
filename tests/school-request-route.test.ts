import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/school-requests/route";
import {
  consumeSchoolRequestAttempt,
  resetSchoolRequestRateLimit,
} from "@/lib/schoolRequestRateLimit";

function request(body: object, client = "203.0.113.10") {
  return new Request("http://localhost/api/school-requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": client,
    },
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
  resetSchoolRequestRateLimit();
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

  it("forwards a Convex 503 closed-request message", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "https://example.convex.site",
    );
    vi.stubEnv("SCHOOL_REQUEST_SHARED_SECRET", "server-secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Hold until the count is done" }),
        {
          status: 503,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      request({
        ...contact,
        lines: [{ isbn: "1", quantity: 2 }],
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Hold until the count is done",
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

  it("rejects repeated submissions from one client without blocking another", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "https://example.convex.site",
    );
    vi.stubEnv("SCHOOL_REQUEST_SHARED_SECRET", "server-secret");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ reference: "JFB-TEST1234" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      ...contact,
      lines: [{ isbn: "1", quantity: 2 }],
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const allowed = await POST(request(body, "203.0.113.10"));
      expect(allowed.status).toBe(201);
    }

    const limited = await POST(request(body, "203.0.113.10"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect(await limited.json()).toEqual({
      error: "Please wait a few minutes before submitting another request.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const otherClient = await POST(request(body, "203.0.113.20"));
    expect(otherClient.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("allows another attempt after the rate-limit window", () => {
    const client = "school-a";
    const startedAt = 1_000_000;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        consumeSchoolRequestAttempt(client, startedAt + attempt).allowed,
      ).toBe(true);
    }
    expect(consumeSchoolRequestAttempt(client, startedAt + 4).allowed).toBe(
      false,
    );
    expect(
      consumeSchoolRequestAttempt(client, startedAt + 10 * 60 * 1000).allowed,
    ).toBe(true);
  });
});
