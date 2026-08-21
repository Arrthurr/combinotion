import { describe, expect, it } from "vitest";
import {
  assertFreshFingerprint,
  assertUniqueSourceIds,
  feedHealth,
  fingerprintOf,
  intakeRetentionDays,
  matchCandidate,
  nextPurgeState,
  parseRow,
  planRow,
  redactError,
  sheetsSourceId,
} from "@/lib/domain/intake";

const reviewFeed = {
  kind: "bookReviews" as const,
  spreadsheetId: "sheet-reviews",
  tabName: "Form Responses 1",
  mapping: {
    identityColumns: ["Timestamp", "Email Address"],
    reviewerColumn: "Your name",
    scoreColumn: "Score",
    feedbackColumn: "Review",
    isbnColumn: "ISBN",
  },
};

const donationFeed = {
  kind: "donationApplications" as const,
  spreadsheetId: "sheet-donations",
  tabName: "Responses",
  mapping: {
    identityColumns: ["Timestamp", "Email"],
    nameColumn: "Name",
    emailColumn: "Email",
    schoolNameColumn: "School",
    schoolAddressColumn: "Address",
  },
};

const reviewHeaders = [
  "Timestamp",
  "Email Address",
  "Your name",
  "Score",
  "Review",
  "ISBN",
];

describe("Google Sheets intake", () => {
  it("parses a review row into stored candidate fields", () => {
    const parsed = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "4",
      "Loved it",
      "9780000000001",
    ]);
    expect(parsed.sourceId).toBe(
      sheetsSourceId(
        "bookReviews",
        "sheet-reviews",
        "Form Responses 1",
        "2026-08-01|pat@example.com",
      ),
    );
    expect(parsed.outcome).toEqual({
      kind: "candidate",
      candidate: {
        kind: "review",
        reviewer: "Pat",
        score: 4,
        feedback: "Loved it",
        isbn: "9780000000001",
      },
    });
  });

  it("marks a review without ISBN or title invalid", () => {
    const parsed = parseRow(
      {
        ...reviewFeed,
        mapping: {
          identityColumns: ["Timestamp"],
          reviewerColumn: "Your name",
          scoreColumn: "Score",
          feedbackColumn: "Review",
        },
      },
      ["Timestamp", "Your name", "Score", "Review"],
      ["2026-08-01", "Pat", "4", "Loved it"],
    );
    expect(parsed.outcome.kind).toBe("invalid");
  });

  it("does not duplicate a replayed or reordered row", () => {
    const first = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "4",
      "Loved it",
      "9780000000001",
    ]);
    const replay = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "4",
      "Loved it",
      "9780000000001",
    ]);
    expect(planRow(null, first)).toEqual({
      kind: "create",
      state: { kind: "pending", candidate: first.outcome.kind === "candidate" ? first.outcome.candidate : expect.fail() },
    });
    expect(
      planRow(
        {
          fingerprint: first.fingerprint,
          state: { kind: "pending", candidate: first.outcome.kind === "candidate" ? first.outcome.candidate : expect.fail() },
        },
        replay,
      ),
    ).toEqual({ kind: "skip" });
  });

  it("reparses an open row when the fingerprint changes", () => {
    const first = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "4",
      "Loved it",
      "9780000000001",
    ]);
    const edited = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "5",
      "Loved it more",
      "9780000000001",
    ]);
    const plan = planRow(
      {
        fingerprint: first.fingerprint,
        state: {
          kind: "pending",
          candidate:
            first.outcome.kind === "candidate"
              ? first.outcome.candidate
              : expect.fail(),
        },
      },
      edited,
    );
    expect(plan.kind).toBe("reparse");
  });

  it("marks source drift when a resolved row later changes", () => {
    const first = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "4",
      "Loved it",
      "9780000000001",
    ]);
    const edited = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "5",
      "Loved it more",
      "9780000000001",
    ]);
    expect(
      planRow(
        {
          fingerprint: first.fingerprint,
          state: {
            kind: "resolved",
            candidate:
              first.outcome.kind === "candidate"
                ? first.outcome.candidate
                : expect.fail(),
            resolution: {
              kind: "createdRecord",
              record: { kind: "review", id: "review_1" },
            },
            resolvedAt: 1,
            sourceDrift: false,
          },
        },
        edited,
      ),
    ).toEqual({ kind: "markDrift" });
  });

  it("auto-applies a review whose ISBN matches a title", () => {
    expect(
      matchCandidate(
        {
          kind: "review",
          reviewer: "Pat",
          score: 4,
          feedback: "Loved it",
          isbn: "9780000000001",
        },
        {
          titleByIsbn: (isbn) =>
            isbn === "9780000000001" ? "title_1" : null,
          personByEmail: () => null,
        },
      ),
    ).toEqual({
      kind: "autoApply",
      target: { kind: "title", id: "title_1" },
    });
  });

  it("leaves unmatched donation applications for staff", () => {
    const parsed = parseRow(donationFeed, [
      "Timestamp",
      "Email",
      "Name",
      "School",
      "Address",
    ], [
      "2026-08-01",
      "new@example.com",
      "Ada",
      "New School",
      "2 Oak",
    ]);
    expect(parsed.outcome.kind).toBe("candidate");
    expect(
      matchCandidate(
        parsed.outcome.kind === "candidate"
          ? parsed.outcome.candidate
          : expect.fail(),
        {
          titleByIsbn: () => null,
          personByEmail: () => null,
        },
      ),
    ).toEqual({ kind: "needsStaff" });
  });

  it("rejects a stale resolve fingerprint", () => {
    expect(() =>
      assertFreshFingerprint(fingerprintOf("a"), fingerprintOf("b")),
    ).toThrow("changed after you opened it");
  });

  it("drops raw payload after 180 days and keeps the rest", () => {
    const receivedAt = 0;
    const now = (intakeRetentionDays + 1) * 24 * 60 * 60 * 1000;
    expect(
      nextPurgeState(
        {
          sourceId: "sheets:bookReviews:sheet:tab:1",
          rawValues: '["a"]',
          receivedAt,
          resolvedRecordId: "review_1",
        },
        now,
      ),
    ).toEqual({
      sourceId: "sheets:bookReviews:sheet:tab:1",
      receivedAt,
      resolvedRecordId: "review_1",
    });
  });

  it("reports missing credentials on feed health", () => {
    expect(
      feedHealth({
        kind: "bookReviews",
        enabled: true,
        configured: true,
        credentialPresent: false,
      }).message,
    ).toBe("Google credentials are missing");
  });

  it("rejects two rows that share a source key", () => {
    const first = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "4",
      "Loved it",
      "9780000000001",
    ]);
    const clash = parseRow(reviewFeed, reviewHeaders, [
      "2026-08-01",
      "pat@example.com",
      "Pat",
      "5",
      "Different review",
      "9780000000002",
    ]);
    expect(() => assertUniqueSourceIds([first, clash])).toThrow(
      "Duplicate sheet row keys",
    );
  });

  it("redacts emails and keys from poll errors", () => {
    expect(
      redactError(new Error("failed for pat@example.com with ya29.abc")),
    ).toBe("failed for [redacted-email] with [redacted-token]");
  });
});
