import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireStaff } from "./lib/auth";
import { required } from "./lib/validation";
import { matchSchool, normalizeSchool } from "../lib/domain/requests";
import {
  assertFreshFingerprint,
  assertUniqueSourceIds,
  feedHealth,
  intakeRetentionDays,
  matchCandidate,
  nextPurgeState,
  planRow,
  redactError,
  type FeedHealth,
  type IntakeCandidate,
  type IntakeFeedKind,
  type IntakeItemState,
  type IntakeMapping,
  type IntakeRecordRef,
  type IntakeResolution,
  type ParsedRow,
} from "../lib/domain/intake";

export { intakeRetentionDays };

const reviewMapping = v.object({
  identityColumns: v.array(v.string()),
  reviewerColumn: v.string(),
  scoreColumn: v.string(),
  feedbackColumn: v.string(),
  isbnColumn: v.optional(v.string()),
  titleTextColumn: v.optional(v.string()),
});

const donationMapping = v.object({
  identityColumns: v.array(v.string()),
  nameColumn: v.string(),
  emailColumn: v.optional(v.string()),
  schoolNameColumn: v.optional(v.string()),
  schoolAddressColumn: v.optional(v.string()),
  messageColumn: v.optional(v.string()),
});

const recordRef = v.object({
  kind: v.union(
    v.literal("person"),
    v.literal("school"),
    v.literal("title"),
    v.literal("review"),
  ),
  id: v.string(),
});

const reviewCandidate = v.object({
  kind: v.literal("review"),
  reviewer: v.string(),
  score: v.number(),
  feedback: v.string(),
  isbn: v.optional(v.string()),
  titleText: v.optional(v.string()),
});

const donationCandidate = v.object({
  kind: v.literal("donationApplication"),
  name: v.string(),
  email: v.optional(v.string()),
  schoolName: v.optional(v.string()),
  schoolAddress: v.optional(v.string()),
  message: v.optional(v.string()),
});

const intakeCandidate = v.union(reviewCandidate, donationCandidate);

function credentialPresent() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
}

async function catalogLookups(ctx: MutationCtx) {
  const [titles, people] = await Promise.all([
    ctx.db.query("titles").collect(),
    ctx.db.query("people").collect(),
  ]);
  return {
    titleByIsbn: (isbn: string) =>
      titles.find((title) => title.isbn === isbn)?._id ?? null,
    personByEmail: (email: string) =>
      people.find(
        (person) => person.email?.toLocaleLowerCase() === email.toLocaleLowerCase(),
      )?._id ?? null,
  };
}

async function insertReviewFromCandidate(
  ctx: MutationCtx,
  titleId: Id<"titles">,
  candidate: Extract<IntakeCandidate, { kind: "review" }>,
) {
  return await ctx.db.insert("reviews", {
    titleId,
    reviewer: candidate.reviewer,
    feedback: candidate.feedback,
    score: candidate.score,
    approved: false,
  });
}

async function applyAutoMatch(
  ctx: MutationCtx,
  candidate: IntakeCandidate,
): Promise<IntakeItemState> {
  const match = matchCandidate(candidate, await catalogLookups(ctx));
  if (match.kind === "needsStaff") {
    return { kind: "pending", candidate };
  }
  if (candidate.kind === "review" && match.target.kind === "title") {
    const reviewId = await insertReviewFromCandidate(
      ctx,
      match.target.id as Id<"titles">,
      candidate,
    );
    return {
      kind: "resolved",
      candidate,
      resolution: {
        kind: "autoApplied",
        record: { kind: "review", id: reviewId },
      },
      resolvedAt: Date.now(),
      sourceDrift: false,
    };
  }
  return {
    kind: "resolved",
    candidate,
    resolution: {
      kind: "autoApplied",
      record: match.target,
    },
    resolvedAt: Date.now(),
    sourceDrift: false,
  };
}

export const listFeeds = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const feeds = await ctx.db.query("intakeFeeds").collect();
    const present = credentialPresent();
    return feeds.map((feed) => ({
      ...feed,
      health: feedHealth({
        kind: feed.kind,
        enabled: feed.state.kind === "enabled",
        configured: Boolean(feed.spreadsheetId && feed.tabName),
        credentialPresent: present,
        lastPoll: feed.lastPoll,
      }),
    }));
  },
});

export const listHealth = query({
  args: {},
  handler: async (ctx): Promise<FeedHealth[]> => {
    await requireStaff(ctx);
    const feeds = await ctx.db.query("intakeFeeds").collect();
    const present = credentialPresent();
    const kinds: IntakeFeedKind[] = ["bookReviews", "donationApplications"];
    return kinds.map((kind) => {
      const feed = feeds.find((row) => row.kind === kind);
      return feedHealth({
        kind,
        enabled: feed?.state.kind === "enabled",
        configured: Boolean(feed),
        credentialPresent: present,
        lastPoll: feed?.lastPoll,
      });
    });
  },
});

export const saveFeedConfig = mutation({
  args: {
    feedId: v.optional(v.id("intakeFeeds")),
    kind: v.union(
      v.literal("bookReviews"),
      v.literal("donationApplications"),
    ),
    spreadsheetId: v.string(),
    tabName: v.string(),
    mapping: v.union(reviewMapping, donationMapping),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const spreadsheetId = required(args.spreadsheetId, "Spreadsheet id");
    const tabName = required(args.tabName, "Tab name");
    if (args.kind === "bookReviews") {
      const mapping = args.mapping as Extract<
        IntakeMapping,
        { reviewerColumn: string }
      >;
      const row = {
        kind: "bookReviews" as const,
        spreadsheetId,
        tabName,
        mapping,
        state: { kind: "disabled" as const },
      };
      if (args.feedId) {
        await ctx.db.replace(args.feedId, row);
        return args.feedId;
      }
      return await ctx.db.insert("intakeFeeds", row);
    }
    const mapping = args.mapping as Extract<IntakeMapping, { nameColumn: string }>;
    const row = {
      kind: "donationApplications" as const,
      spreadsheetId,
      tabName,
      mapping,
      state: { kind: "disabled" as const },
    };
    if (args.feedId) {
      await ctx.db.replace(args.feedId, row);
      return args.feedId;
    }
    return await ctx.db.insert("intakeFeeds", row);
  },
});

export const disableFeed = mutation({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => {
    await requireStaff(ctx);
    const feed = await ctx.db.get(feedId);
    if (!feed) {
      throw new Error("Feed not found");
    }
    await ctx.db.patch(feedId, { state: { kind: "disabled" } });
    return feedId;
  },
});

export const markFeedEnabled = internalMutation({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => {
    const feed = await ctx.db.get(feedId);
    if (!feed) {
      throw new Error("Feed not found");
    }
    await ctx.db.patch(feedId, {
      state: { kind: "enabled", verifiedAt: Date.now() },
    });
    return feedId;
  },
});

export const recordFeedPoll = internalMutation({
  args: {
    feedId: v.id("intakeFeeds"),
    outcome: v.union(
      v.object({
        kind: v.literal("ok"),
        at: v.number(),
        rowsSeen: v.number(),
        newItems: v.number(),
      }),
      v.object({
        kind: v.literal("failed"),
        at: v.number(),
        message: v.string(),
      }),
    ),
  },
  handler: async (ctx, { feedId, outcome }) => {
    const feed = await ctx.db.get(feedId);
    if (!feed) {
      throw new Error("Feed not found");
    }
    await ctx.db.patch(feedId, { lastPoll: outcome });
  },
});

export const listPollableFeeds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const feeds = await ctx.db.query("intakeFeeds").collect();
    return feeds.filter((feed) => feed.state.kind === "enabled");
  },
});

export const getFeed = internalQuery({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => await ctx.db.get(feedId),
});

export const recordRows = internalMutation({
  args: {
    feedId: v.id("intakeFeeds"),
    rows: v.array(
      v.object({
        sourceId: v.string(),
        fingerprint: v.string(),
        rawValues: v.string(),
        outcome: v.union(
          v.object({
            kind: v.literal("candidate"),
            candidate: intakeCandidate,
          }),
          v.object({
            kind: v.literal("invalid"),
            errors: v.array(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { feedId, rows }) => {
    const feed = await ctx.db.get(feedId);
    if (!feed) {
      throw new Error("Feed not found");
    }
    assertUniqueSourceIds(rows);
    let newItems = 0;
    for (const row of rows as ParsedRow[]) {
      const existing = await ctx.db
        .query("intakeItems")
        .withIndex("by_source", (q) => q.eq("sourceId", row.sourceId))
        .unique();
      const plan = planRow(
        existing
          ? { fingerprint: existing.fingerprint, state: existing.state }
          : null,
        row,
      );
      switch (plan.kind) {
        case "skip":
          break;
        case "create": {
          const state =
            plan.state.kind === "pending"
              ? await applyAutoMatch(ctx, plan.state.candidate)
              : plan.state;
          await ctx.db.insert("intakeItems", {
            feedId,
            sourceId: row.sourceId,
            fingerprint: row.fingerprint,
            receivedAt: Date.now(),
            rawValues: row.rawValues,
            state,
          });
          newItems += 1;
          break;
        }
        case "reparse": {
          if (!existing) {
            break;
          }
          const state =
            plan.state.kind === "pending"
              ? await applyAutoMatch(ctx, plan.state.candidate)
              : plan.state;
          await ctx.db.patch(existing._id, {
            fingerprint: row.fingerprint,
            rawValues: row.rawValues,
            state,
          });
          break;
        }
        case "markDrift":
          if (existing && existing.state.kind === "resolved") {
            await ctx.db.patch(existing._id, {
              fingerprint: row.fingerprint,
              state: { ...existing.state, sourceDrift: true },
            });
          }
          break;
        default: {
          const unhandled: never = plan;
          throw new Error(`Unhandled intake plan: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    await ctx.db.patch(feedId, {
      lastPoll: {
        kind: "ok",
        at: Date.now(),
        rowsSeen: rows.length,
        newItems,
      },
    });
    return { newItems, rowsSeen: rows.length };
  },
});

export const listItems = query({
  args: {
    state: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("invalid"),
        v.literal("resolved"),
      ),
    ),
  },
  handler: async (ctx, { state }) => {
    await requireStaff(ctx);
    const items = state
      ? await ctx.db
          .query("intakeItems")
          .withIndex("by_stateKind", (q) => q.eq("state.kind", state))
          .collect()
      : await ctx.db.query("intakeItems").collect();
    const [people, schools, titles] = await Promise.all([
      ctx.db.query("people").collect(),
      ctx.db.query("schools").collect(),
      ctx.db.query("titles").collect(),
    ]);
    return items
      .sort((left, right) => left.receivedAt - right.receivedAt)
      .map((item) => ({
        itemId: item._id,
        sourceId: item.sourceId,
        fingerprint: item.fingerprint,
        receivedAt: item.receivedAt,
        rawPayloadPresent: item.rawValues !== undefined,
        state: item.state,
        suggestions: suggestionsFor(item.state, people, schools, titles),
      }));
  },
});

async function requireAttachTarget(
  ctx: MutationCtx,
  record: IntakeRecordRef,
) {
  switch (record.kind) {
    case "person":
      if (!(await ctx.db.get(record.id as Id<"people">))) {
        throw new Error("Person not found");
      }
      return;
    case "school":
      if (!(await ctx.db.get(record.id as Id<"schools">))) {
        throw new Error("School not found");
      }
      return;
    case "title":
      if (!(await ctx.db.get(record.id as Id<"titles">))) {
        throw new Error("Title not found");
      }
      return;
    case "review":
      if (!(await ctx.db.get(record.id as Id<"reviews">))) {
        throw new Error("Review not found");
      }
      return;
    default: {
      const unhandled: never = record;
      throw new Error(`Unhandled attach target: ${JSON.stringify(unhandled)}`);
    }
  }
}

function suggestionsFor(
  state: IntakeItemState,
  people: Doc<"people">[],
  schools: Doc<"schools">[],
  titles: Doc<"titles">[],
): IntakeRecordRef[] {
  if (state.kind === "invalid") {
    return [];
  }
  const candidate = state.candidate;
  if (candidate.kind === "review") {
    return titles
      .filter(
        (title) =>
          title.isbn === candidate.isbn ||
          (candidate.titleText !== undefined &&
            title.title.toLocaleLowerCase() ===
              candidate.titleText.toLocaleLowerCase()),
      )
      .map((title) => ({ kind: "title" as const, id: title._id }));
  }
  const refs: IntakeRecordRef[] = [];
  if (candidate.email) {
    for (const person of people) {
      if (
        person.email?.toLocaleLowerCase() === candidate.email.toLocaleLowerCase()
      ) {
        refs.push({ kind: "person", id: person._id });
      }
    }
  }
  if (candidate.schoolName && candidate.schoolAddress) {
    const match = matchSchool({
      name: candidate.schoolName,
      address: candidate.schoolAddress,
      schools: schools.map((school) => ({
        id: school._id,
        normalizedName: school.normalizedName,
        normalizedAddress: school.normalizedAddress,
      })),
    });
    if (match.matchStatus === "attached") {
      refs.push({ kind: "school", id: match.schoolId });
    }
  }
  return refs;
}

export const resolveItem = mutation({
  args: {
    itemId: v.id("intakeItems"),
    fingerprint: v.string(),
    action: v.union(
      v.object({ kind: v.literal("attach"), record: recordRef }),
      v.object({
        kind: v.literal("createPerson"),
        name: v.string(),
        email: v.optional(v.string()),
        schoolName: v.optional(v.string()),
        schoolAddress: v.optional(v.string()),
      }),
      v.object({
        kind: v.literal("createTitle"),
        title: v.string(),
        author: v.string(),
        isbn: v.string(),
      }),
      v.object({ kind: v.literal("dismiss"), reason: v.string() }),
    ),
  },
  handler: async (ctx, { itemId, fingerprint, action }) => {
    await requireStaff(ctx);
    const item = await ctx.db.get(itemId);
    if (!item) {
      throw new Error("Intake item not found");
    }
    assertFreshFingerprint(item.fingerprint, fingerprint);
    if (item.state.kind === "resolved") {
      return item.state.resolution;
    }
    if (item.state.kind === "invalid") {
      throw new Error("Fix the source row before resolving this item");
    }
    const candidate = item.state.candidate;
    let resolution: IntakeResolution;
    switch (action.kind) {
      case "dismiss":
        resolution = {
          kind: "dismissed",
          reason: required(action.reason, "Reason"),
        };
        break;
      case "attach": {
        await requireAttachTarget(ctx, action.record);
        if (candidate.kind === "review" && action.record.kind === "title") {
          const reviewId = await insertReviewFromCandidate(
            ctx,
            action.record.id as Id<"titles">,
            candidate,
          );
          resolution = {
            kind: "attached",
            record: { kind: "review", id: reviewId },
          };
          break;
        }
        resolution = { kind: "attached", record: action.record };
        break;
      }
      case "createPerson": {
        const personId = await ctx.db.insert("people", {
          name: required(action.name, "Name"),
          ...(action.email?.trim() ? { email: action.email.trim() } : {}),
          roles: ["donor"],
        });
        if (action.schoolName && action.schoolAddress) {
          const schools = await ctx.db.query("schools").collect();
          const existingSchool = matchSchool({
            name: action.schoolName,
            address: action.schoolAddress,
            schools: schools.map((school) => ({
              id: school._id,
              normalizedName: school.normalizedName,
              normalizedAddress: school.normalizedAddress,
            })),
          });
          const schoolId =
            existingSchool.matchStatus === "attached"
              ? (existingSchool.schoolId as Id<"schools">)
              : await ctx.db.insert("schools", {
                  name: action.schoolName.trim(),
                  address: action.schoolAddress.trim(),
                  normalizedName: normalizeSchool(action.schoolName),
                  normalizedAddress: normalizeSchool(action.schoolAddress),
                });
          await ctx.db.insert("schoolContacts", {
            schoolId,
            personId,
          });
        }
        resolution = {
          kind: "createdRecord",
          record: { kind: "person", id: personId },
        };
        break;
      }
      case "createTitle": {
        if (candidate.kind !== "review") {
          throw new Error("Create a title from a review item");
        }
        const isbn = required(action.isbn, "ISBN");
        const existing = await ctx.db
          .query("titles")
          .withIndex("by_isbn", (q) => q.eq("isbn", isbn))
          .unique();
        const titleId =
          existing?._id ??
          (await ctx.db.insert("titles", {
            title: required(action.title, "Title"),
            author: required(action.author, "Author"),
            isbn,
            quantityOnHand: 0,
            activeReservedQuantity: 0,
            reorderNeeded: false,
          }));
        const reviewId = await insertReviewFromCandidate(
          ctx,
          titleId,
          candidate,
        );
        resolution = {
          kind: "createdRecord",
          record: { kind: "review", id: reviewId },
        };
        break;
      }
      default: {
        const unhandled: never = action;
        throw new Error(`Unhandled resolve action: ${JSON.stringify(unhandled)}`);
      }
    }
    await ctx.db.patch(itemId, {
      state: {
        kind: "resolved",
        candidate,
        resolution,
        resolvedAt: Date.now(),
        sourceDrift: false,
      },
    });
    return resolution;
  },
});

export const purgeExpiredRaw = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const items = await ctx.db.query("intakeItems").collect();
    let purged = 0;
    for (const item of items) {
      const next = nextPurgeState(item, now);
      if (next.rawValues === undefined && item.rawValues !== undefined) {
        await ctx.db.patch(item._id, { rawValues: undefined });
        purged += 1;
      }
    }
    return purged;
  },
});

export const verifyAndEnableFeed = action({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => {
    await ctx.runQuery(internal.staff.assertStaff, {});
    const feed = await ctx.runQuery(internal.intake.getFeed, { feedId });
    if (!feed) {
      throw new Error("Feed not found");
    }
    try {
      await ctx.runAction(internal.integrations.googleSheets.verifyFeed, {
        feedId,
      });
      await ctx.runMutation(internal.intake.markFeedEnabled, { feedId });
      return { kind: "enabled" as const };
    } catch (error) {
      const message = redactError(error);
      await ctx.runMutation(internal.intake.recordFeedPoll, {
        feedId,
        outcome: { kind: "failed", at: Date.now(), message },
      });
      return { kind: "failed" as const, message };
    }
  },
});

export const pollFeeds = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.integrations.googleSheets.pollApprovedFeeds, {});
  },
});
