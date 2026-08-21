/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { fingerprintOf, intakeRetentionDays } from "../lib/domain/intake";

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
    expect(await t.mutation(internal.intake.recordRows, { feedId, rows: [row] })).toEqual({
      newItems: 0,
      rowsSeen: 1,
    });
    const items = await asStaff.query(api.intake.listItems, {});
    expect(items).toHaveLength(1);
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

  it("creates a title and review from an unmatched review row", async () => {
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
    const [item] = await asStaff.query(api.intake.listItems, { state: "pending" });
    if (!item) {
      throw new Error("Expected a pending review item");
    }
    const resolution = await asStaff.mutation(api.intake.resolveItem, {
      itemId: item.itemId,
      fingerprint: item.fingerprint,
      action: {
        kind: "createTitle",
        title: "A New Book",
        author: "Ann Author",
        isbn: "9780000000999",
      },
    });
    expect(resolution.kind).toBe("createdRecord");
    const titles = await asStaff.query(api.titles.listTitles, {});
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(titles).toEqual([
      expect.objectContaining({
        title: "A New Book",
        isbn: "9780000000999",
      }),
    ]);
    expect(reviews).toEqual([
      expect.objectContaining({
        title: "A New Book",
        reviewer: "Pat",
        score: 5,
        approved: false,
      }),
    ]);
  });

  it("creates a review when a pending review is attached to a title", async () => {
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
              titleText: "Known Book",
            },
          },
        },
      ],
    });
    const [item] = await asStaff.query(api.intake.listItems, { state: "pending" });
    if (!item) {
      throw new Error("Expected a pending review item");
    }
    const resolution = await asStaff.mutation(api.intake.resolveItem, {
      itemId: item.itemId,
      fingerprint: item.fingerprint,
      action: {
        kind: "attach",
        record: { kind: "title", id: titleId },
      },
    });
    expect(resolution).toEqual({
      kind: "attached",
      record: { kind: "review", id: expect.any(String) },
    });
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(reviews).toEqual([
      expect.objectContaining({
        titleId,
        reviewer: "Rae",
        feedback: "Useful in class",
      }),
    ]);
  });

  it("auto-applies a review whose ISBN already exists", async () => {
    const { t, asStaff } = await createStaffTest();
    await asStaff.mutation(api.titles.createTitle, {
      title: "Known Book",
      author: "Ann",
      isbn: "9780000000001",
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
            },
          },
        },
      ],
    });
    const items = await asStaff.query(api.intake.listItems, {});
    expect(items[0]?.state.kind).toBe("resolved");
    const reviews = await asStaff.query(api.reviews.list, {});
    expect(reviews).toHaveLength(1);
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
      kind: "bookReviews",
      spreadsheetId: "sheet-reviews",
      tabName: "Responses",
      mapping: reviewMapping,
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "sheets:bookReviews:sheet-reviews:Responses:old",
          fingerprint: "old",
          rawValues: '["secret"]',
          outcome: {
            kind: "candidate",
            candidate: {
              kind: "review",
              reviewer: "Pat",
              score: 4,
              feedback: "Loved it",
              isbn: "9780000000001",
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

  it("reports missing Google credentials on feed health", async () => {
    const { asStaff } = await createStaffTest();
    const health = await asStaff.query(api.intake.listHealth, {});
    expect(health.map((feed) => feed.message)).toEqual([
      "Google credentials are missing",
      "Google credentials are missing",
    ]);
  });
});
