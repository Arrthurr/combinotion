/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/school-requests/route";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");
const contact = {
  schoolName: "Joy School",
  address: "1 Main Street",
  contactName: "Pat Reader",
  email: "pat@example.com",
};
const valid = { ...contact, lines: [{ isbn: "1", quantity: 2 }] };
const invalid = "Please correct the highlighted information.";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Exercise the same contract through Convex HTTP and the full Next → Convex hop.
describe.each(["Convex", "Next"])(
  "%s school request submission contract",
  (adapter) => {
    async function setup({ paused = false, shortage = false } = {}) {
      vi.stubEnv("SCHOOL_REQUEST_SHARED_SECRET", "test-secret");
      vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://test.convex.site");
      const t = convexTest(schema, modules);
      await t.mutation(internal.staff.seedStaff, {
        clerkId: "staff_1",
        email: "staff@example.com",
      });
      await t.run(async (ctx) => {
        await ctx.db.insert("orgSettings", {
          key: "org",
          lowStockThreshold: 15,
          publicRequests: paused
            ? { kind: "paused", message: "Count in progress" }
            : { kind: "open" },
        });
        await ctx.db.insert("titles", {
          title: "First title",
          author: "Ann",
          isbn: "1",
          quantityOnHand: 7,
          activeReservedQuantity: 0,
          reorderNeeded: false,
        });
        await ctx.db.insert("titles", {
          title: "Second title",
          author: "Ben",
          isbn: "2",
          quantityOnHand: 3,
          activeReservedQuantity: shortage ? 4 : 0,
          reorderNeeded: false,
        });
      });
      const asStaff = t.withIdentity({ subject: "staff_1" });
      if (adapter === "Next") {
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url: string, init: RequestInit) => {
            expect(url).toBe("https://test.convex.site/school-requests");
            return await t.fetch("/school-requests", init);
          }),
        );
      }
      return {
        t,
        asStaff,
        submit: (body: string, ip = "203.0.113.10") =>
          adapter === "Next"
            ? POST(
                new Request("https://app.example/api/school-requests", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    "x-forwarded-for": ip,
                  },
                  body,
                }),
              )
            : t.fetch("/school-requests", {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-school-request-secret": "test-secret",
                },
                body,
              }),
      };
    }

    it.each([
      { name: "malformed JSON", body: "{", status: 400, error: invalid },
      {
        name: "missing titles",
        body: JSON.stringify(contact),
        status: 400,
        error: invalid,
      },
      {
        name: "partial legacy input",
        body: JSON.stringify({ ...contact, isbn: "1" }),
        status: 400,
        error: invalid,
      },
      {
        name: "blank contact",
        body: JSON.stringify({ ...valid, schoolName: "  " }),
        status: 400,
        error: invalid,
      },
      {
        name: "fractional quantity",
        body: JSON.stringify({
          ...contact,
          lines: [{ isbn: "1", quantity: 1.5 }],
        }),
        status: 400,
        error: invalid,
      },
      {
        name: "unavailable second title",
        body: JSON.stringify({
          ...contact,
          lines: [
            { isbn: "1", quantity: 2 },
            { isbn: "missing", quantity: 1 },
          ],
        }),
        status: 409,
        error: "Title is not available",
      },
      {
        name: "too many copies of second title",
        body: JSON.stringify({
          ...contact,
          lines: [
            { isbn: "1", quantity: 2 },
            { isbn: "2", quantity: 4 },
          ],
        }),
        status: 409,
        error: "Those copies are no longer available",
      },
      {
        name: "title in shortage",
        body: JSON.stringify({
          ...contact,
          lines: [{ isbn: "2", quantity: 1 }],
        }),
        status: 409,
        error: "Those copies are no longer available",
        shortage: true,
      },
      {
        name: "duplicate title",
        body: JSON.stringify({
          ...contact,
          lines: [
            { isbn: "1", quantity: 1 },
            { isbn: "1", quantity: 2 },
          ],
        }),
        status: 400,
        error: "A title can appear only once in a request",
      },
      {
        name: "closed requests",
        body: JSON.stringify(valid),
        status: 503,
        error: "Count in progress",
        paused: true,
      },
    ])(
      "rejects $name without creating a request or changing available-to-request",
      async ({ body, status, error, paused, shortage }) => {
        const { t, asStaff, submit } = await setup({ paused, shortage });
        const before = await t.query(api.titles.listRequestable, {});
        const response = await submit(body);
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error });
        expect(await asStaff.query(api.schoolRequests.listActive, {})).toEqual(
          [],
        );
        expect(await t.query(api.titles.listRequestable, {})).toEqual(before);
      },
    );

    it.each([
      {
        name: "multiple lines",
        body: {
          ...contact,
          lines: [
            { isbn: "1", quantity: "2" },
            { isbn: "2", quantity: 3 },
          ],
        },
        remaining: [5],
      },
      {
        name: "legacy input",
        body: { ...contact, isbn: "1", quantity: "2" },
        remaining: [5, 3],
      },
    ])(
      "normalizes $name and reserves the requested copies",
      async ({ body, remaining }) => {
        const { t, asStaff, submit } = await setup();
        const response = await submit(
          JSON.stringify({
            ...body,
            schoolName: "  Joy School  ",
            email: " pat@example.com ",
          }),
        );
        expect(response.status).toBe(201);
        const payload = await response.json();
        expect(payload).toEqual({
          reference: expect.stringMatching(/^JFB-[A-Z0-9]{8}$/),
        });
        const requests = await asStaff.query(api.schoolRequests.listActive, {});
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
          schoolName: "Joy School",
          email: "pat@example.com",
          reference: payload.reference,
        });
        expect(
          (await t.query(api.titles.listRequestable, {})).map(
            (title) => title.availableQuantity,
          ),
        ).toEqual(remaining);
      },
    );

    it("replays an idempotency key without reserving again even when copies are exhausted", async () => {
      const { t, asStaff, submit } = await setup();
      const body = JSON.stringify({
        ...contact,
        lines: [{ isbn: "1", quantity: 7 }],
        idempotencyKey: " same-key ",
      });
      const first = await submit(body);
      const replay = await submit(body);
      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(await first.json());
      const requests = await asStaff.query(api.schoolRequests.listActive, {});
      expect(requests).toHaveLength(1);
      expect(requests[0].lines).toHaveLength(1);
      expect(requests[0].lines[0].quantity).toBe(7);
      expect(await t.query(api.titles.listRequestable, {})).toEqual([
        {
          title: "Second title",
          author: "Ben",
          isbn: "2",
          availableQuantity: 3,
        },
      ]);
    });

    it("limits normalized email across IPs and permits another email and the exact window boundary", async () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
      const { asStaff, submit } = await setup();
      // Expected business failures still consume attempts, without reserving copies.
      const body = { ...contact, lines: [{ isbn: "missing", quantity: 1 }] };
      for (let attempt = 0; attempt < 5; attempt++) {
        expect((await submit(JSON.stringify(body))).status).toBe(409);
      }
      now.mockReturnValue(1_000_001);
      const limited = await submit(
        JSON.stringify({ ...body, email: " PAT@example.com " }),
        "203.0.113.20",
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBe("600");
      expect(await limited.json()).toEqual({
        error: "Please wait a few minutes before submitting another request.",
      });
      expect(
        (await submit(JSON.stringify({ ...valid, email: "other@example.com" })))
          .status,
      ).toBe(201);
      now.mockReturnValue(1_599_999);
      const beforeBoundary = await submit(JSON.stringify(valid));
      expect(beforeBoundary.status).toBe(429);
      expect(beforeBoundary.headers.get("Retry-After")).toBe("1");
      now.mockReturnValue(1_600_000);
      expect((await submit(JSON.stringify(valid))).status).toBe(201);
      expect(
        await asStaff.query(api.schoolRequests.listActive, {}),
      ).toHaveLength(2);
    });
  },
);
