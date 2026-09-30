import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { findTitleByIsbn } from "./catalog";
import { required } from "./validation";
import { normalizeIsbn, stripNotionMarkdown } from "../../lib/domain/catalog";
import { resolveDonor } from "./resolution";
import {
  assertFreshFingerprint,
  assertUniqueSourceIds,
  intakeRetentionDays,
  matchCandidate,
  parseRow,
  planRow,
  redactError,
  type IntakeCandidate,
  type IntakeItemState,
  type IntakeRecordRef,
  type IntakeResolution,
  type ParsedRow,
} from "../../lib/domain/intake";

export type ResolveIntakeItemArgs = {
  itemId: Id<"intakeItems">;
  fingerprint: string;
  action:
    | { kind: "attach"; record: IntakeRecordRef }
    | {
        kind: "createPerson";
        name: string;
        email?: string;
        schoolName?: string;
        schoolAddress?: string;
        personId?: Id<"people">;
        schoolId?: Id<"schools">;
      }
    | { kind: "createTitle"; title: string; author: string; isbn: string }
    | { kind: "dismiss"; reason: string };
};

async function comparisonFingerprint(value: string) {
  if (/^sha256:[a-f0-9]{64}$/.test(value)) return value;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function catalogLookups(ctx: MutationCtx) {
  const titles = await ctx.db.query("titles").collect();
  return {
    titleByIsbn: (isbn: string) => {
      const normalized = normalizeIsbn(isbn);
      if (!normalized) return null;
      return (
        titles.find((title) => normalizeIsbn(title.isbn) === normalized)?._id ??
        null
      );
    },
    titleByTitleText: (titleText: string) => {
      const normalized = stripNotionMarkdown(titleText).toLocaleLowerCase();
      if (!normalized) return null;
      const matches = titles.filter(
        (title) =>
          stripNotionMarkdown(title.title).toLocaleLowerCase() === normalized,
      );
      return matches.length === 1 ? matches[0]._id : null;
    },
    personByEmail: () => null,
  };
}

async function insertReviewFromCandidate(
  ctx: MutationCtx,
  candidate: Extract<IntakeCandidate, { kind: "review" }>,
  titleId?: Id<"titles">,
) {
  const title = titleId ? await ctx.db.get(titleId) : null;
  const titleText =
    candidate.titleText?.trim() || title?.title || candidate.isbn?.trim();
  if (!titleText) throw new Error("Reviewed title is required");
  return await ctx.db.insert("reviews", {
    ...(titleId ? { titleId } : {}),
    titleText,
    ...(candidate.isbn?.trim() ? { isbn: candidate.isbn.trim() } : {}),
    reviewer: candidate.reviewer,
    feedback: candidate.feedback,
    score: candidate.score,
    approved: false,
  });
}

function resolvedState(
  candidate: IntakeCandidate,
  resolution: IntakeResolution,
): IntakeItemState {
  return {
    kind: "resolved",
    candidate,
    resolution,
    resolvedAt: Date.now(),
    sourceDrift: false,
  };
}

async function applyAutoMatch(
  ctx: MutationCtx,
  candidate: IntakeCandidate,
): Promise<IntakeItemState> {
  if (candidate.kind === "donationApplication") {
    const resolved = await resolveDonor(ctx, candidate, "automatic");
    if (!resolved) return { kind: "pending", candidate };
    return resolvedState(candidate, {
      kind: "autoApplied", record: { kind: "person", id: resolved.personId },
    });
  }
  const match = matchCandidate(candidate, await catalogLookups(ctx));
  if (match.kind === "needsStaff") return { kind: "pending", candidate };
  if (match.kind === "recordReview") {
    if (candidate.kind !== "review")
      throw new Error("Review match requires a review candidate");
    const reviewId = await insertReviewFromCandidate(
      ctx,
      candidate,
      match.titleId as Id<"titles"> | undefined,
    );
    return resolvedState(candidate, {
      kind: "autoApplied",
      record: { kind: "review", id: reviewId },
    });
  }
  return resolvedState(candidate, {
    kind: "autoApplied",
    record: match.target,
  });
}

async function requireAttachTarget(ctx: MutationCtx, record: IntakeRecordRef) {
  switch (record.kind) {
    case "person":
      if (!(await ctx.db.get(record.id as Id<"people">)))
        throw new Error("Person not found");
      return;
    case "school":
      if (!(await ctx.db.get(record.id as Id<"schools">)))
        throw new Error("School not found");
      return;
    case "title":
      if (!(await ctx.db.get(record.id as Id<"titles">)))
        throw new Error("Title not found");
      return;
    case "review":
      if (!(await ctx.db.get(record.id as Id<"reviews">)))
        throw new Error("Review not found");
      return;
    default: {
      const unhandled: never = record;
      throw new Error(`Unhandled attach target: ${JSON.stringify(unhandled)}`);
    }
  }
}

export async function recordIntakeRows(
  ctx: MutationCtx,
  feedId: Id<"intakeFeeds">,
  rows: ParsedRow[],
) {
  const feed = await ctx.db.get(feedId);
  if (!feed) throw new Error("Feed not found");
  assertUniqueSourceIds(rows);
  let newItems = 0;
  for (const parsed of rows) {
    const row = {
      ...parsed,
      fingerprint: await comparisonFingerprint(parsed.fingerprint),
    };
    const existing = await ctx.db
      .query("intakeItems")
      .withIndex("by_source", (q) => q.eq("sourceId", row.sourceId))
      .unique();
    const plan = planRow(
      existing
        ? {
            fingerprint: await comparisonFingerprint(existing.fingerprint),
            state: existing.state,
          }
        : null,
      row,
    );
    switch (plan.kind) {
      case "skip":
        if (existing && existing.fingerprint !== row.fingerprint) {
          // Upgrade legacy JSON fingerprints without replaying side effects or
          // mistaking the representation change for source drift.
          await ctx.db.patch(existing._id, {
            fingerprint: row.fingerprint,
            ...(existing.rawValues !== undefined
              ? {
                  sourcePayload:
                    row.sourcePayload ??
                    headersAndCellsFromInvalid(existing) ??
                    undefined,
                }
              : {}),
          });
        }
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
          sourcePayload: row.sourcePayload,
          state,
        });
        newItems += 1;
        break;
      }
      case "reparse": {
        if (!existing) break;
        const state =
          plan.state.kind === "pending"
            ? await applyAutoMatch(ctx, plan.state.candidate)
            : plan.state;
        await ctx.db.patch(existing._id, {
          fingerprint: row.fingerprint,
          rawValues: row.rawValues,
          sourcePayload: row.sourcePayload,
          state,
        });
        break;
      }
      case "markDrift":
        if (existing?.state.kind === "resolved") {
          await ctx.db.patch(existing._id, {
            fingerprint: row.fingerprint,
            rawValues: row.rawValues,
            sourcePayload: row.sourcePayload,
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
    lastPoll: { kind: "ok", at: Date.now(), rowsSeen: rows.length, newItems },
  });
  return { newItems, rowsSeen: rows.length };
}

export async function resolveIntakeItem(
  ctx: MutationCtx,
  args: ResolveIntakeItemArgs,
) {
  const { itemId, fingerprint, action } = args;
  const item = await ctx.db.get(itemId);
  if (!item) throw new Error("Intake item not found");
  assertFreshFingerprint(item.fingerprint, fingerprint);
  if (item.state.kind === "resolved") return item.state.resolution;
  if (item.state.kind === "invalid")
    throw new Error("Fix the source row before resolving this item");
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
      if (candidate.kind === "donationApplication" &&
        (action.record.kind === "person" || action.record.kind === "school")) {
        const { personId } = await resolveDonor(ctx, {
          ...candidate,
          ...(action.record.kind === "person"
            ? { personId: action.record.id as Id<"people"> }
            : { schoolId: action.record.id as Id<"schools"> }),
        });
        resolution = { kind: "attached", record: { kind: "person", id: personId } };
      } else if (candidate.kind === "review" && action.record.kind === "title") {
        const reviewId = await insertReviewFromCandidate(
          ctx,
          candidate,
          action.record.id as Id<"titles">,
        );
        resolution = {
          kind: "attached",
          record: { kind: "review", id: reviewId },
        };
      } else resolution = { kind: "attached", record: action.record };
      break;
    }
    case "createPerson": {
      if (candidate.kind !== "donationApplication")
        throw new Error("Create a person from a donation application");
      const { personId, created } = await resolveDonor(ctx, action);
      resolution = {
        kind: created ? "createdRecord" : "attached",
        record: { kind: "person", id: personId },
      };
      break;
    }
    case "createTitle": {
      if (candidate.kind !== "review")
        throw new Error("Create a title from a review item");
      const isbn = normalizeIsbn(required(action.isbn, "ISBN"));
      const title = stripNotionMarkdown(required(action.title, "Title"));
      const author = stripNotionMarkdown(required(action.author, "Author"));
      if (!isbn) throw new Error("ISBN is required");
      if (!title) throw new Error("Title is required");
      if (!author) throw new Error("Author is required");
      const existing = await findTitleByIsbn(ctx, isbn);
      const titleId =
        existing?._id ??
        (await ctx.db.insert("titles", {
          title,
          author,
          isbn,
          quantityOnHand: 0,
          activeReservedQuantity: 0,
          reorderNeeded: false,
        }));
      const reviewId = await insertReviewFromCandidate(ctx, candidate, titleId);
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
  await ctx.db.patch(itemId, { state: resolvedState(candidate, resolution) });
  return resolution;
}

type BatchOperation = "reprocess" | "acceptReview" | "createDonation";
export type ItemTransitionOutcome =
  "accepted" | "created" | "attached" | "reparsed" | "stillInvalid" | "skipped";

// Called through an internal mutation so each caught failure rolls back all of
// that item's writes, while successful items remain in the enclosing batch.
export async function processIntakeItem(
  ctx: MutationCtx,
  itemId: Id<"intakeItems">,
  operation: BatchOperation,
): Promise<ItemTransitionOutcome> {
  const item = await ctx.db.get(itemId);
  if (!item) throw new Error("Intake item not found");
  if (operation === "reprocess") {
    if (item.state.kind !== "invalid") return "skipped";
    const feed = await ctx.db.get(item.feedId);
    if (!feed) throw new Error("Feed not found");
    const recovered = headersAndCellsFromInvalid(item);
    if (!recovered)
      throw new Error("Source payload is unavailable; poll the source again");
    const row = parseRow(feed, recovered.headers, recovered.cells);
    const existingBySource = await ctx.db
      .query("intakeItems")
      .withIndex("by_source", (q) => q.eq("sourceId", row.sourceId))
      .unique();
    if (existingBySource && existingBySource._id !== item._id) {
      await ctx.db.delete(item._id);
      return "reparsed";
    }
    const state =
      row.outcome.kind === "invalid"
        ? { kind: "invalid" as const, errors: row.outcome.errors }
        : await applyAutoMatch(ctx, row.outcome.candidate);
    await ctx.db.patch(item._id, {
      sourceId: row.sourceId,
      fingerprint: await comparisonFingerprint(row.fingerprint),
      rawValues: row.rawValues,
      sourcePayload: row.sourcePayload,
      state,
    });
    return row.outcome.kind === "invalid" ? "stillInvalid" : "reparsed";
  }
  if (item.state.kind !== "pending") return "skipped";
  const candidate = item.state.candidate;
  if ((operation === "acceptReview") !== (candidate.kind === "review"))
    return "skipped";
  const matched = await applyAutoMatch(ctx, candidate);
  if (matched.kind === "resolved") {
    await ctx.db.patch(item._id, { state: matched });
    return operation === "acceptReview" ? "accepted" : "attached";
  }
  if (candidate.kind !== "donationApplication") return "skipped";
  const { personId, created } = await resolveDonor(ctx, candidate);
  await ctx.db.patch(item._id, {
    state: resolvedState(candidate, {
      kind: created ? "createdRecord" : "attached",
      record: { kind: "person", id: personId },
    }),
  });
  return created ? "created" : "attached";
}

async function processBatch(
  ctx: MutationCtx,
  operation: BatchOperation,
  limit?: number,
) {
  const max = limit ?? 200;
  if (!Number.isInteger(max) || max < 0)
    throw new Error("Limit must be a non-negative integer");
  const stateKind = operation === "reprocess" ? "invalid" : "pending";
  const items = await ctx.db
    .query("intakeItems")
    .withIndex("by_stateKind", (q) => q.eq("state.kind", stateKind))
    .collect();
  const counts = {
    accepted: 0,
    created: 0,
    attached: 0,
    reparsed: 0,
    stillInvalid: 0,
    skipped: 0,
  };
  const failureDetails: {
    itemId: Id<"intakeItems">;
    sourceId: string;
    message: string;
  }[] = [];
  let attempted = 0;
  for (const item of items) {
    if (
      item.state.kind === "pending" &&
      (operation === "acceptReview") !==
        (item.state.candidate.kind === "review")
    )
      continue;
    if (attempted >= max) break;
    attempted += 1;
    try {
      const outcome = await ctx.runMutation(internal.intake.processItem, {
        itemId: item._id,
        operation,
      });
      counts[outcome] += 1;
    } catch (error) {
      failureDetails.push({
        itemId: item._id,
        sourceId: item.sourceId,
        message: redactError(error),
      });
    }
  }
  return { ...counts, failures: failureDetails.length, failureDetails };
}

export async function acceptPendingReviewItems(
  ctx: MutationCtx,
  limit?: number,
) {
  const { accepted, failures, failureDetails } = await processBatch(
    ctx,
    "acceptReview",
    limit,
  );
  return { accepted, failures, failureDetails };
}

export async function createPendingDonationItems(
  ctx: MutationCtx,
  limit?: number,
) {
  const { created, attached, failures, failureDetails } = await processBatch(
    ctx,
    "createDonation",
    limit,
  );
  return { created, attached, failures, failureDetails };
}

function headersAndCellsFromInvalid(item: Doc<"intakeItems">) {
  if (item.state.kind !== "invalid") return null;
  if (item.sourcePayload) return item.sourcePayload;
  // Compatibility for rows written before sourcePayload existed. A purged
  // legacy row must not be recovered from its old comparison fingerprint.
  if (item.rawValues === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(item.fingerprint);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("headers" in parsed) ||
      !("cells" in parsed) ||
      !Array.isArray(parsed.headers) ||
      !Array.isArray(parsed.cells)
    )
      return null;
    return {
      headers: parsed.headers.map((header) => String(header)),
      cells: parsed.cells.map((cell) => String(cell ?? "")),
    };
  } catch {
    return null;
  }
}

export async function reprocessInvalidIntakeItems(
  ctx: MutationCtx,
  limit?: number,
) {
  const { reparsed, stillInvalid, failures, failureDetails } =
    await processBatch(ctx, "reprocess", limit);
  return { reparsed, stillInvalid, failures, failureDetails };
}

export async function purgeExpiredIntakeRaw(ctx: MutationCtx) {
  const now = Date.now();
  const items = await ctx.db.query("intakeItems").collect();
  let purged = 0;
  for (const item of items) {
    if (now - item.receivedAt < intakeRetentionDays * 24 * 60 * 60 * 1000)
      continue;
    const hadPayload =
      item.rawValues !== undefined || item.sourcePayload !== undefined;
    const fingerprint = await comparisonFingerprint(item.fingerprint);
    if (hadPayload || fingerprint !== item.fingerprint) {
      await ctx.db.patch(item._id, {
        rawValues: undefined,
        sourcePayload: undefined,
        fingerprint,
      });
      if (hadPayload) purged += 1;
    }
  }
  return purged;
}
