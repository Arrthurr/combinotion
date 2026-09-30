/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { fingerprintOf, intakeRetentionDays, parseRow } from "../lib/domain/intake";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function createStaffTest() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff_1",
    email: "coo@example.com",
  });
  return {
    t,
    asStaff: t.withIdentity({ subject: "staff_1" }),
  };
}

const reviewMapping = {
  identityColumns: ["Timestamp", "Email Address"],
  reviewerColumn: "Your name",
  scoreColumn: "Score",
  feedbackColumn: "Review",
  isbnColumn: "ISBN",
};

const donationMapping = {
  identityColumns: ["Timestamp", "Email"],
  nameColumn: "Name",
  emailColumn: "Email",
};

describe("intake", () => {
  it("does not duplicate a replayed sheet row", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    const row = {
      sourceId: "sheets:bookReviews:sheet-reviews:Responses:1",
      fingerprint: fingerprintOf({ isbn: "9780000000001" }),
      rawValues: '["Pat"]',
      outcome: {
        kind: "candidate" as const,
        candidate: {
          kind: "review" as const,
          reviewer: "Pat",
          score: 4,
          feedback: "Loved it",
          isbn: "9780000000001",
        },
      },
    };
    expect(await t.mutation(internal.intake.recordRows, { feedId, rows: [row] })).toEqual({
      newItems: 1,
      rowsSeen: 1,
    });
    const [original] = await asStaff.query(api.intake.listItems, {});
    // Simulate a pre-upgrade record with the JSON comparison representation.
    await t.run(async (ctx) => {
      await ctx.db.patch(original.itemId, { fingerprint: row.fingerprint });
    });
    expect(await t.mutation(internal.intake.recordRows, { feedId, rows: [row] })).toEqual({
      newItems: 0,
      rowsSeen: 1,
    });
    const items = await asStaff.query(api.intake.listItems, {});
    expect(items).toHaveLength(1);
    expect(items[0].state).toEqual(original.state);
    expect(items[0].fingerprint).toBe(original.fingerprint);
    expect(await asStaff.query(api.reviews.list, {})).toHaveLength(1);
  });

  it("creates a person from an unmatched donation row and keeps the source", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "donationApplications",
      spreadsheetId: "sheet-donations",
      tabName: "Responses",
      mapping: donationMapping,
    });
    const row = {
      sourceId: "sheets:donationApplications:sheet-donations:Responses:ada",
      fingerprint: fingerprintOf({ email: "ada@example.com" }),
      rawValues: '["Ada"]',
      outcome: {
        kind: "candidate" as const,
        candidate: {
          kind: "donationApplication" as const,
          name: "Ada Donor",
          email: "ada@example.com",
          schoolName: "New School",
          schoolAddress: "2 Oak Street",
        },
      },
    };
    await t.mutation(internal.intake.recordRows, { feedId, rows: [row] });
    const [item] = await asStaff.query(api.intake.listItems, { state: "pending" });
    if (!item) {
      throw new Error("Expected a pending intake item");
    }
    expect(item.state.kind).toBe("pending");
    const resolution = await asStaff.mutation(api.intake.resolveItem, {
      itemId: item.itemId,
      fingerprint: item.fingerprint,
      action: {
        kind: "createPerson",
        name: "Ada Donor",
        email: "ada@example.com",
        schoolName: "New School",
        schoolAddress: "2 Oak Street",
      },
    });
    expect(resolution).toEqual({
      kind: "createdRecord",
      record: { kind: "person", id: expect.any(String) },
    });
    expect(await asStaff.mutation(api.intake.resolveItem, {
      itemId: item.itemId, fingerprint: item.fingerprint,
      action: { kind: "createPerson", name: "Should not be created again" },
    })).toEqual(resolution);
    await t.mutation(internal.intake.recordRows, { feedId, rows: [row] });
    await t.mutation(internal.intake.workDownIntakeBacklog, {});
    const people = await asStaff.query(api.people.listPeople, {});
    expect(people).toEqual([
      expect.objectContaining({
        name: "Ada Donor",
        email: "ada@example.com",
      }),
    ]);
    const [resolved] = await asStaff.query(api.intake.listItems, {
      state: "resolved",
    });
    expect(resolved?.sourceId).toBe(row.sourceId);
    expect(resolved?.state).toMatchObject({
      kind: "resolved",
      resolution,
    });
  });

  it("records a review without creating inventory for an unmatched work", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "sheets:bookReviews:sheet-reviews:Responses:new",
          fingerprint: fingerprintOf({ isbn: "9780000000999" }),
          rawValues: "[]",
          outcome: {
            kind: "candidate",
            candidate: {
              kind: "review",
              reviewer: "Pat",
              score: 5,
              feedback: "New favorite",
              isbn: "9780000000999",
              titleText: "A New Book",
            },
          },
        },
      ],
    });
    const pending = await asStaff.query(api.intake.listItems, { state: "pending" });
    expect(pending).toEqual([]);
    const titles = await asStaff.query(api.titles.listTitles, {});
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(titles).toEqual([]);
    expect(reviews).toEqual([
      expect.objectContaining({
        title: "A New Book",
        inInventory: false,
        reviewer: "Pat",
        score: 5,
        approved: false,
      }),
    ]);
  });

  it("falls back from an unknown ISBN to cleaned, case-insensitive title text", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await asStaff.mutation(api.titles.createTitle, {
      title: "Known Book",
      author: "Ann",
      isbn: "9780000000100",
    });
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "sheets:bookReviews:sheet-reviews:Responses:attach",
          fingerprint: "attach",
          rawValues: "[]",
          outcome: {
            kind: "candidate",
            candidate: {
              kind: "review",
              reviewer: "Rae",
              score: 3,
              feedback: "Useful in class",
              isbn: "9780000000999",
              titleText: "  [**KNOWN**](https://example.org)   book  ",
            },
          },
        },
      ],
    });
    const pending = await asStaff.query(api.intake.listItems, { state: "pending" });
    expect(pending).toEqual([]);
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(reviews).toEqual([
      expect.objectContaining({
        titleId,
        inInventory: true,
        reviewer: "Rae",
        feedback: "Useful in class",
      }),
    ]);
  });

  it("leaves ambiguous title-text matches unlinked but lets an ISBN identify an edition", async () => {
    const { t, asStaff } = await createStaffTest();
    await asStaff.mutation(api.titles.createTitle, {
      title: "Known Book",
      author: "Ann",
      isbn: "9780000000100",
    });
    const secondTitleId = await asStaff.mutation(api.titles.createTitle, {
      title: "KNOWN BOOK",
      author: "Bea",
      isbn: "9780000000200",
    });
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    for (const [reviewer, isbn] of [
      ["Unknown ISBN", "9780000000999"],
      ["No ISBN", undefined],
      ["Known ISBN", "978-0000000200"],
    ] as const) {
      await t.mutation(internal.intake.recordRows, {
        feedId,
        rows: [{
          sourceId: `sheets:bookReviews:sheet-reviews:Responses:${reviewer}`,
          fingerprint: reviewer,
          rawValues: "[]",
          outcome: {
            kind: "candidate",
            candidate: {
              kind: "review",
              reviewer,
              score: 4,
              feedback: "Useful in class",
              titleText: "**Known**   Book",
              ...(isbn ? { isbn } : {}),
            },
          },
        }],
      });
    }
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(reviews).toHaveLength(3);
    for (const reviewer of ["Unknown ISBN", "No ISBN"]) {
      const review = reviews.find((entry) => entry.reviewer === reviewer);
      expect(review).toMatchObject({ inInventory: false });
      expect(review).not.toHaveProperty("titleId");
    }
    expect(reviews.find((entry) => entry.reviewer === "Known ISBN")).toMatchObject({
      titleId: secondTitleId,
      inInventory: true,
    });
  });

  it("prefers the ISBN match over a conflicting unique title-text match", async () => {
    const { t, asStaff } = await createStaffTest();
    const titleId = await asStaff.mutation(api.titles.createTitle, {
      title: "Known Book",
      author: "Ann",
      isbn: "9780000000001",
    });
    await asStaff.mutation(api.titles.createTitle, {
      title: "Other Book",
      author: "Bea",
      isbn: "9780000000002",
    });
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "sheets:bookReviews:sheet-reviews:Responses:auto",
          fingerprint: "auto",
          rawValues: "[]",
          outcome: {
            kind: "candidate",
            candidate: {
              kind: "review",
              reviewer: "Pat",
              score: 4,
              feedback: "Loved it",
              isbn: "9780000000001",
              titleText: "Other Book",
            },
          },
        },
      ],
    });
    const items = await asStaff.query(api.intake.listItems, {});
    expect(items[0]?.state.kind).toBe("resolved");
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ titleId, inInventory: true });
  });

  it("rejects a stale resolve fingerprint", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "donationApplications",
      spreadsheetId: "sheet-donations",
      tabName: "Responses",
      mapping: donationMapping,
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "sheets:donationApplications:sheet-donations:Responses:ada",
          fingerprint: "fresh",
          rawValues: "[]",
          outcome: {
            kind: "candidate",
            candidate: { kind: "donationApplication", name: "Ada" },
          },
        },
      ],
    });
    const [item] = await asStaff.query(api.intake.listItems, { state: "pending" });
    if (!item) {
      throw new Error("Expected a pending intake item");
    }
    await expect(
      asStaff.mutation(api.intake.resolveItem, {
        itemId: item.itemId,
        fingerprint: "stale",
        action: { kind: "dismiss", reason: "Duplicate" },
      }),
    ).rejects.toThrow("changed after you opened it");
  });

  it("purges raw values after 180 days and keeps the intake record", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "donationApplications",
      spreadsheetId: "sheet-donations",
      tabName: "Responses",
      mapping: donationMapping,
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "sheets:donationApplications:sheet-donations:Responses:old",
          fingerprint: "old",
          rawValues: '["secret"]',
          outcome: {
            kind: "candidate",
            candidate: {
              kind: "donationApplication",
              name: "Ada",
            },
          },
        },
      ],
    });
    const [item] = await asStaff.query(api.intake.listItems, {});
    if (!item) {
      throw new Error("Expected an intake item");
    }
    expect(item.rawPayloadPresent).toBe(true);
    await t.run(async (ctx) => {
      await ctx.db.patch(item.itemId, {
        receivedAt:
          Date.now() - (intakeRetentionDays + 1) * 24 * 60 * 60 * 1000,
      });
    });
    expect(await t.mutation(internal.intake.purgeExpiredRaw, {})).toBe(1);
    const [kept] = await asStaff.query(api.intake.listItems, {});
    expect(kept.itemId).toBe(item.itemId);
    expect(kept.rawPayloadPresent).toBe(false);
    expect(kept.state.kind).toBe("pending");
  });

  it("accepts leftover pending reviews without creating titles", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("intakeItems", {
        feedId,
        sourceId: "sheets:bookReviews:sheet-reviews:Responses:leftover",
        fingerprint: "leftover",
        receivedAt: Date.now(),
        state: {
          kind: "pending",
          candidate: {
            kind: "review",
            reviewer: "Pat",
            score: 4,
            feedback: "Buy this.",
            titleText: "A Book We Should Buy",
          },
        },
      });
    });
    expect(await asStaff.mutation(api.intake.acceptPendingReviews, {})).toEqual({
      accepted: 1,
      failures: 0,
      failureDetails: [],
    });
    expect(await asStaff.query(api.intake.listItems, { state: "pending" })).toEqual(
      [],
    );
    expect(await asStaff.query(api.titles.listTitles, {})).toEqual([]);
    expect(await asStaff.query(api.reviews.list, {})).toEqual([
      expect.objectContaining({
        title: "A Book We Should Buy",
        inInventory: false,
      }),
    ]);
  });

  it("creates people from unmatched donation applications in bulk", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "donationApplications",
      spreadsheetId: "sheet-donations",
      tabName: "Responses",
      mapping: donationMapping,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("intakeItems", {
        feedId,
        sourceId: "sheets:donationApplications:sheet-donations:Responses:bulk",
        fingerprint: "bulk-donation",
        receivedAt: Date.now(),
        state: {
          kind: "pending",
          candidate: {
            kind: "donationApplication",
            name: "Ada Donor",
            email: "ada@example.com",
            schoolName: "New School",
            schoolAddress: "2 Oak Street",
          },
        },
      });
    });
    expect(await asStaff.mutation(api.intake.createPendingDonations, {})).toEqual(
      {
        created: 1,
        attached: 0,
        failures: 0,
        failureDetails: [],
      },
    );
    expect(await asStaff.query(api.intake.listItems, { state: "pending" })).toEqual(
      [],
    );
    expect(await asStaff.query(api.people.listPeople, {})).toEqual([
      expect.objectContaining({
        name: "Ada Donor",
        email: "ada@example.com",
      }),
    ]);
  });

  it("reprocesses invalid review rows after header casing is fixed", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: {
        identityColumns: ["Timestamp", "Your name", "Book Title"],
        reviewerColumn: "Your name",
        scoreColumn: "Story Engagement",
        feedbackColumn: "Notes for this section",
        titleTextColumn: "Book Title",
      },
    });
    const headers = [
      "Timestamp",
      "Your name",
      "Book title",
      "Story Engagement",
      "Notes for this section",
    ];
    const cells = ["2026-08-01", "Pat", "Bing's Cherries", "4", "Loved it"];
    await t.run(async (ctx) => {
      await ctx.db.insert("intakeItems", {
        feedId,
        sourceId: "sheets:bookReviews:sheet-reviews:Responses:stale-invalid",
        fingerprint: fingerprintOf({ headers, cells }),
        receivedAt: Date.now(),
        rawValues: JSON.stringify(cells),
        state: {
          kind: "invalid",
          errors: ["Missing identity column Book Title", "ISBN or title is required"],
        },
      });
    });
    expect(
      await t.mutation(internal.intake.workDownIntakeBacklog, { limit: 50 }),
    ).toEqual({
      invalid: { reparsed: 1, stillInvalid: 0, failures: 0, failureDetails: [] },
      reviews: { accepted: 0, failures: 0, failureDetails: [] },
      donations: { created: 0, attached: 0, failures: 0, failureDetails: [] },
      counts: { pending: 0, invalid: 0, resolved: 1 },
    });
    expect(await asStaff.query(api.reviews.list, {})).toEqual([
      expect.objectContaining({
        title: "Bing's Cherries",
        reviewer: "Pat",
        inInventory: false,
      }),
    ]);
  });

  it("recovers invalid rows from source payload rather than an opaque fingerprint", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews",
      spreadsheetId: "reviews",
      tabName: "Responses",
      mapping: { ...reviewMapping, scoreColumn: "Wrong score" },
    });
    const headers = ["Timestamp", "Email Address", "Your name", "Score", "Review", "ISBN"];
    const cells = ["one", "pat@example.com", "Pat", "4", "Loved it", "9780000000001"];
    const parsed = parseRow({
      kind: "bookReviews", spreadsheetId: "reviews", tabName: "Responses",
      mapping: { ...reviewMapping, scoreColumn: "Wrong score" },
    }, headers, cells);
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [{ ...parsed, fingerprint: "opaque-comparison-token" }],
    });
    await asStaff.mutation(api.intake.saveFeedConfig, {
      feedId, kind: "bookReviews", spreadsheetId: "reviews", tabName: "Responses",
      mapping: reviewMapping,
    });
    const result = await t.mutation(internal.intake.workDownIntakeBacklog, {});
    expect(result.invalid).toMatchObject({ reparsed: 1, stillInvalid: 0, failures: 0 });
    await t.mutation(internal.intake.workDownIntakeBacklog, {});
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(reviews).toEqual([expect.objectContaining({ reviewer: "Pat", score: 4, feedback: "Loved it" })]);
    expect(await asStaff.query(api.intake.listItems, {})).toEqual([
      expect.objectContaining({ sourceId: parsed.sourceId, state: expect.objectContaining({ kind: "resolved" }) }),
    ]);
  });

  it("reports feed health before a sheet is approved", async () => {
    const { asStaff } = await createStaffTest();
    const health = await asStaff.query(api.intake.listHealth, {});
    const expected = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
      ? "Approve a sheet, tab, and mapping"
      : "Google credentials are missing";
    expect(health.map((feed) => feed.message)).toEqual([expected, expected]);
  });

  it("returns item-level failures and bounds attempted work, not just successful work", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "bookReviews", spreadsheetId: "reviews", tabName: "Responses", mapping: reviewMapping,
    });
    const [badId] = await t.run(async (ctx) => {
      const ids = [];
      for (const [sourceId, titleText] of [["bad", " "], ["good", "A Good Book"]]) {
        ids.push(await ctx.db.insert("intakeItems", {
          feedId, sourceId, fingerprint: sourceId, receivedAt: Date.now(),
          state: { kind: "pending", candidate: { kind: "review", reviewer: "Pat", score: 4, feedback: "Useful", titleText } },
        }));
      }
      return ids;
    });
    expect(await asStaff.mutation(api.intake.acceptPendingReviews, { limit: 0 })).toEqual({
      accepted: 0, failures: 0, failureDetails: [],
    });
    await expect(asStaff.mutation(api.intake.acceptPendingReviews, { limit: -1 })).rejects.toThrow("non-negative integer");
    await expect(asStaff.mutation(api.intake.acceptPendingReviews, { limit: 1.5 })).rejects.toThrow("non-negative integer");
    const limited = await asStaff.mutation(api.intake.acceptPendingReviews, { limit: 1 });
    expect(limited).toEqual({
      accepted: 0, failures: 1,
      failureDetails: [{ itemId: badId, sourceId: "bad", message: "Reviewed title is required" }],
    });
    expect(await asStaff.query(api.reviews.list, {})).toEqual([]);
    expect(await asStaff.query(api.intake.listItems, { state: "pending" })).toHaveLength(2);
    const result = await asStaff.mutation(api.intake.acceptPendingReviews, {});
    expect(result).toMatchObject({ accepted: 1, failures: 1 });
    expect(await asStaff.query(api.reviews.list, {})).toEqual([
      expect.objectContaining({ title: "A Good Book", reviewer: "Pat" }),
    ]);
  });

  it("marks resolved rows as drifted without replacing the review or its resolution timestamp", async () => {
    const { t, asStaff } = await createStaffTest();
    const feed = { kind: "bookReviews" as const, spreadsheetId: "reviews", tabName: "Responses", mapping: reviewMapping };
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, feed);
    const headers = ["Timestamp", "Email Address", "Your name", "Score", "Review", "ISBN"];
    const original = parseRow(feed, headers, ["one", "pat@example.com", "Pat", "3", "Original review", "9780000000001"]);
    await t.mutation(internal.intake.recordRows, { feedId, rows: [original] });
    const [before] = await asStaff.query(api.intake.listItems, {});
    if (before.state.kind !== "resolved") throw new Error("Expected automatic resolution");
    const edited = parseRow(feed, headers, ["one", "pat@example.com", "Pat", "5", "Edited review", "9780000000001"]);
    for (const row of [edited, edited, original]) {
      await t.mutation(internal.intake.recordRows, { feedId, rows: [row] });
      const [after] = await asStaff.query(api.intake.listItems, {});
      expect(after).toMatchObject({
        itemId: before.itemId,
        state: { ...before.state, sourceDrift: true },
      });
      expect(after.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      if (row === original) expect(after.fingerprint).toBe(before.fingerprint);
      else expect(after.fingerprint).not.toBe(before.fingerprint);
    }
    expect(await asStaff.query(api.reviews.list, {})).toEqual([
      expect.objectContaining({ score: 3, feedback: "Original review" }),
    ]);
  });

  it("reparses invalid donations to pending and deduplicates people across bulk retries", async () => {
    const { t, asStaff } = await createStaffTest();
    const feed = { kind: "donationApplications" as const, spreadsheetId: "donations", tabName: "Responses", mapping: donationMapping };
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, { ...feed, mapping: { ...donationMapping, nameColumn: "Wrong name" } });
    const headers = ["Timestamp", "Email", "Name"];
    const row = parseRow({ ...feed, mapping: { ...donationMapping, nameColumn: "Wrong name" } }, headers, ["one", "ada@example.com", "Ada"]);
    await t.mutation(internal.intake.recordRows, { feedId, rows: [row] });
    await asStaff.mutation(api.intake.saveFeedConfig, { ...feed, feedId });
    const [invalid] = await asStaff.query(api.intake.listItems, {});
    expect(await t.mutation(internal.intake.processItem, { itemId: invalid.itemId, operation: "reprocess" })).toBe("reparsed");
    expect(await asStaff.query(api.intake.listItems, { state: "pending" })).toEqual([
      expect.objectContaining({ itemId: invalid.itemId, state: { kind: "pending", candidate: { kind: "donationApplication", name: "Ada", email: "ada@example.com" } } }),
    ]);
    const other = parseRow(feed, headers, ["two", "ADA@example.com", "Ada again"]);
    await t.mutation(internal.intake.recordRows, { feedId, rows: [other] });
    expect(await asStaff.mutation(api.intake.createPendingDonations, {})).toEqual({
      created: 1, attached: 1, failures: 0, failureDetails: [],
    });
    expect(await asStaff.mutation(api.intake.createPendingDonations, {})).toEqual({
      created: 0, attached: 0, failures: 0, failureDetails: [],
    });
    const corrected = parseRow(feed, headers, ["one", "ada@example.com", "Ada"]);
    await t.mutation(internal.intake.recordRows, { feedId, rows: [corrected, other] });
    expect(await asStaff.query(api.people.listPeople, {})).toEqual([
      expect.objectContaining({ name: "Ada", email: "ada@example.com" }),
    ]);
  });

  it("drops a stale invalid source copy when a poll already resolved its corrected identity", async () => {
    const { t, asStaff } = await createStaffTest();
    const feed = { kind: "bookReviews" as const, spreadsheetId: "reviews", tabName: "Responses", mapping: reviewMapping };
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, feed);
    const headers = ["Timestamp", "Email Address", "Your name", "Score", "Review", "ISBN"];
    const row = parseRow(feed, headers, ["one", "pat@example.com", "Pat", "4", "Useful", "9780000000001"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("intakeItems", {
        feedId, sourceId: "stale-identity", fingerprint: "opaque", receivedAt: Date.now(),
        sourcePayload: row.sourcePayload, rawValues: row.rawValues,
        state: { kind: "invalid", errors: ["Old mapping failed"] },
      });
    });
    await t.mutation(internal.intake.recordRows, { feedId, rows: [row] });
    const result = await t.mutation(internal.intake.workDownIntakeBacklog, {});
    expect(result.invalid).toEqual({ reparsed: 1, stillInvalid: 0, failures: 0, failureDetails: [] });
    expect(await asStaff.query(api.intake.listItems, {})).toHaveLength(1);
    expect(await asStaff.query(api.reviews.list, {})).toHaveLength(1);
  });

  it("purges both source representations and does not resurrect legacy rows from fingerprints", async () => {
    const { t, asStaff } = await createStaffTest();
    const feed = { kind: "bookReviews" as const, spreadsheetId: "reviews", tabName: "Responses", mapping: reviewMapping };
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, feed);
    const headers = ["Timestamp", "Email Address", "Your name", "Score", "Review", "ISBN"];
    const cells = ["one", "pat@example.com", "Pat", "4", "Useful", "9780000000001"];
    await t.run(async (ctx) => {
      for (const sourceId of ["legacy", "new", "already-purged"]) {
        await ctx.db.insert("intakeItems", {
          feedId, sourceId, fingerprint: fingerprintOf({ headers, cells }),
          receivedAt: Date.now() - (intakeRetentionDays + 1) * 24 * 60 * 60 * 1000,
          ...(sourceId === "already-purged" ? {} : { rawValues: JSON.stringify(cells) }),
          ...(sourceId === "new" ? { sourcePayload: { headers, cells } } : {}),
          state: { kind: "invalid", errors: ["Old mapping failed"] },
        });
      }
    });
    expect(await t.mutation(internal.intake.purgeExpiredRaw, {})).toBe(2);
    expect(await t.mutation(internal.intake.purgeExpiredRaw, {})).toBe(0);
    const result = await t.mutation(internal.intake.workDownIntakeBacklog, {});
    const items = await asStaff.query(api.intake.listItems, {});
    expect(result.invalid.failureDetails).toEqual(items.map((item) => ({
      itemId: item.itemId, sourceId: item.sourceId,
      message: expect.stringContaining("Source payload is unavailable"),
    })));
    for (const item of items) {
      expect(item.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(item.rawPayloadPresent).toBe(false);
    }
    expect(result.counts).toEqual({ invalid: 3, pending: 0, resolved: 0 });
    expect(await asStaff.query(api.reviews.list, {})).toEqual([]);
  });

  it("retains source payload just before 180 days and purges it at the boundary", async () => {
    const { t, asStaff } = await createStaffTest();
    const feedId = await asStaff.mutation(api.intake.saveFeedConfig, {
      kind: "donationApplications", spreadsheetId: "donations", tabName: "Responses", mapping: donationMapping,
    });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await t.run(async (ctx) => {
        for (const [sourceId, offset] of [["younger", 1], ["boundary", 0]] as const) {
          await ctx.db.insert("intakeItems", {
            feedId, sourceId, fingerprint: sourceId,
            receivedAt: now - intakeRetentionDays * 24 * 60 * 60 * 1000 + offset,
            sourcePayload: { headers: ["Name"], cells: ["Ada"] },
            state: { kind: "pending", candidate: { kind: "donationApplication", name: "Ada" } },
          });
        }
      });
      expect(await t.mutation(internal.intake.purgeExpiredRaw, {})).toBe(1);
      const items = await asStaff.query(api.intake.listItems, {});
      expect(items.find((item) => item.sourceId === "younger")?.rawPayloadPresent).toBe(true);
      expect(items.find((item) => item.sourceId === "boundary")?.rawPayloadPresent).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });
});
