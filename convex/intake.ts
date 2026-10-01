import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { staffAction, staffMutation, staffQuery } from "./lib/auth";
import { required } from "./lib/validation";
import { normalizeIsbn } from "../lib/domain/catalog";
import { matchSchool } from "../lib/domain/requests";
import { normalizeEmail } from "./lib/resolution";
import {
  acceptPendingReviewItems,
  createPendingDonationItems,
  processIntakeItem,
  purgeExpiredIntakeRaw,
  recordIntakeRows,
  reprocessInvalidIntakeItems,
  resolveIntakeItem,
  type ItemTransitionOutcome,
} from "./lib/intakeLifecycle";
import {
  feedHealth,
  intakeRetentionDays,
  redactError,
  type FeedHealth,
  type IntakeFeedKind,
  type IntakeItemState,
  type IntakeMapping,
  type IntakeRecordRef,
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

export const listFeeds = staffQuery({
  args: {},
  handler: async (ctx) => {
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

export const listHealth = staffQuery({
  args: {},
  handler: async (ctx): Promise<FeedHealth[]> => {
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

export const saveFeedConfig = staffMutation({
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

export const disableFeed = staffMutation({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => {
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
        sourcePayload: v.optional(v.object({
          headers: v.array(v.string()),
          cells: v.array(v.string()),
        })),
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
  handler: async (ctx, { feedId, rows }) =>
    await recordIntakeRows(ctx, feedId, rows as ParsedRow[]),
});

export const listItems = staffQuery({
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
        rawPayloadPresent: item.rawValues !== undefined || item.sourcePayload !== undefined,
        state: item.state,
        suggestions: suggestionsFor(item.state, people, schools, titles),
        attachmentOptions: item.state.kind !== "pending" ? [] :
          item.state.candidate.kind === "donationApplication"
            ? [
                ...people.map((person) => ({ kind: "person" as const, id: person._id, label: `Person · ${person.name}` })),
                ...schools.map((school) => ({ kind: "school" as const, id: school._id, label: `School · ${school.name} (${school.address})` })),
              ]
            : titles.map((title) => ({ kind: "title" as const, id: title._id, label: `Title · ${title.title} (${title.isbn})` })),
      }));
  },
});

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
          (candidate.isbn !== undefined &&
            normalizeIsbn(title.isbn) === normalizeIsbn(candidate.isbn)) ||
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
        person.email && normalizeEmail(person.email) === normalizeEmail(candidate.email)
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

export const resolveItem = staffMutation({
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
        personId: v.optional(v.id("people")),
        schoolId: v.optional(v.id("schools")),
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
  handler: async (ctx, args) => {
    return await resolveIntakeItem(ctx, args);
  },
});

export const processItem = internalMutation({
  args: {
    itemId: v.id("intakeItems"),
    operation: v.union(v.literal("reprocess"), v.literal("acceptReview"), v.literal("createDonation")),
  },
  handler: async (ctx, { itemId, operation }): Promise<ItemTransitionOutcome> =>
    await processIntakeItem(ctx, itemId, operation),
});

export const acceptPendingReviews = staffMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await acceptPendingReviewItems(ctx, limit);
  },
});

export const createPendingDonations = staffMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await createPendingDonationItems(ctx, limit);
  },
});

/** Ops: `npx convex run intake:workDownIntakeBacklog --prod` */
export const workDownIntakeBacklog = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const invalid = await reprocessInvalidIntakeItems(ctx, limit);
    const reviews = await acceptPendingReviewItems(ctx, limit);
    const donations = await createPendingDonationItems(ctx, limit);
    const remaining = await ctx.db.query("intakeItems").collect();
    const counts = { pending: 0, invalid: 0, resolved: 0 };
    for (const item of remaining) {
      counts[item.state.kind] += 1;
    }
    return { invalid, reviews, donations, counts };
  },
});

export const purgeExpiredRaw = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredIntakeRaw(ctx),
});

export const verifyAndEnableFeed = staffAction({
  args: { feedId: v.id("intakeFeeds") },
  handler: async (ctx, { feedId }) => {
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
