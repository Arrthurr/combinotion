import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { requireStaff } from "../lib/auth";
import {
  dryRunImport,
  parseImportRows,
  sourceFor,
  type ImportRow,
} from "../../lib/domain/notionImport";
import { normalizeSchool } from "../../lib/domain/requests";
import { appendInventoryMovement } from "../inventory";

async function importedId(ctx: MutationCtx, sourceId: string) {
  const existing = await ctx.db
    .query("importRecords")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .unique();
  return existing?.recordId;
}

async function remember(
  ctx: MutationCtx,
  sourceId: string,
  recordKind: string,
  recordId: string,
) {
  await ctx.db.insert("importRecords", {
    sourceId,
    recordKind,
    recordId,
    importedAt: Date.now(),
  });
}

async function applyRows(
  ctx: MutationCtx,
  typedRows: ImportRow[],
  expectedDigest: string,
) {
    const report = dryRunImport(typedRows);
    if (report.digest !== expectedDigest) {
      throw new Error("Import preview is stale. Run a dry-run again.");
    }
    if (report.invalid.length > 0) {
      return report;
    }
    const notionToId = new Map<string, string>();
    for (const row of typedRows) {
      const sourceId = sourceFor(row);
      const already = await importedId(ctx, sourceId);
      if (already) {
        if (row.kind !== "openingBalance") {
          notionToId.set(row.notionId, already);
        }
        continue;
      }
      switch (row.kind) {
        case "person": {
          const id = await ctx.db.insert("people", {
            name: row.name,
            ...(row.email ? { email: row.email } : {}),
            roles: row.roles,
          });
          await remember(ctx, sourceId, "person", id);
          notionToId.set(row.notionId, id);
          break;
        }
        case "school": {
          const id = await ctx.db.insert("schools", {
            name: row.name,
            address: row.address,
            normalizedName: normalizeSchool(row.name),
            normalizedAddress: normalizeSchool(row.address),
          });
          await remember(ctx, sourceId, "school", id);
          notionToId.set(row.notionId, id);
          break;
        }
        case "title": {
          const existingTitle = await ctx.db
            .query("titles")
            .withIndex("by_isbn", (q) => q.eq("isbn", row.isbn))
            .unique();
          const id =
            existingTitle?._id ??
            (await ctx.db.insert("titles", {
              title: row.title,
              author: row.author,
              isbn: row.isbn,
              quantityOnHand: 0,
              activeReservedQuantity: 0,
              reorderNeeded: false,
            }));
          await remember(ctx, sourceId, "title", id);
          notionToId.set(row.notionId, id);
          break;
        }
        case "review": {
          const titleDoc = await ctx.db
            .query("titles")
            .withIndex("by_isbn", (q) => q.eq("isbn", row.isbn))
            .unique();
          if (!titleDoc) {
            throw new Error(`Title not found for review ${row.notionId}`);
          }
          const id = await ctx.db.insert("reviews", {
            titleId: titleDoc._id,
            reviewer: row.reviewer,
            feedback: row.feedback,
            score: row.score,
            approved: false,
          });
          await remember(ctx, sourceId, "review", id);
          break;
        }
        case "request": {
          const schoolId = notionToId.get(row.schoolNotionId) as
            | Id<"schools">
            | undefined;
          const school = schoolId ? await ctx.db.get(schoolId) : null;
          const requestId = await ctx.db.insert("schoolRequests", {
            ...(schoolId ? { schoolId } : {}),
            schoolName: school?.name ?? row.contactName,
            schoolAddress: school?.address ?? "",
            contactName: row.contactName,
            email: row.email,
            status:
              row.disposition.kind === "verifiedActive"
                ? "active"
                : row.disposition.status,
            matchStatus: schoolId ? "attached" : "unmatched",
            reference: `IMP-${row.notionId.slice(0, 8)}`,
            createdAt: row.createdAt,
          });
          if (row.disposition.kind === "verifiedActive") {
            for (const line of row.disposition.lines) {
              const titleDoc = await ctx.db
                .query("titles")
                .withIndex("by_isbn", (q) => q.eq("isbn", line.isbn))
                .unique();
              if (!titleDoc) {
                throw new Error(`Title not found for request ${row.notionId}`);
              }
              await ctx.db.insert("reservations", {
                titleId: titleDoc._id,
                schoolRequestId: requestId,
                quantity: line.quantity,
                active: true,
              });
              await appendInventoryMovement(ctx, {
                titleId: titleDoc._id,
                kind: "reservation",
                quantity: line.quantity,
                sourceId: `reservation:${requestId}:${titleDoc._id}`,
              });
            }
          }
          await remember(ctx, sourceId, "request", requestId);
          break;
        }
        case "visit": {
          const schoolId = notionToId.get(row.schoolNotionId) as
            | Id<"schools">
            | undefined;
          if (!schoolId) {
            throw new Error(`School not found for visit ${row.notionId}`);
          }
          const visitId = await ctx.db.insert("visits", {
            schoolId,
            occurredAt: row.occurredAt,
            ...(row.followUp ? { followUp: row.followUp } : {}),
            effectGeneration: 1,
            origin: "notionImport",
          });
          for (const notionId of row.staffNotionIds) {
            const personId = notionToId.get(notionId) as Id<"people"> | undefined;
            if (!personId) continue;
            await ctx.db.insert("visitPeople", {
              visitId,
              personId,
              kind: "staff",
            });
          }
          for (const notionId of row.readerNotionIds) {
            const personId = notionToId.get(notionId) as Id<"people"> | undefined;
            if (!personId) continue;
            await ctx.db.insert("visitPeople", {
              visitId,
              personId,
              kind: "reader",
            });
          }
          for (const book of row.books) {
            const titleDoc = await ctx.db
              .query("titles")
              .withIndex("by_isbn", (q) => q.eq("isbn", book.isbn))
              .unique();
            if (!titleDoc) {
              throw new Error(`Title not found for visit ${row.notionId}`);
            }
            await ctx.db.insert("visitBooks", {
              visitId,
              titleId: titleDoc._id,
              donatedQuantity: book.donatedQuantity,
              readAloud: book.readAloud,
              consumptionStatus: "none",
              consumedQuantity: 0,
            });
          }
          await remember(ctx, sourceId, "visit", visitId);
          break;
        }
        case "openingBalance": {
          const titleDoc = await ctx.db
            .query("titles")
            .withIndex("by_isbn", (q) => q.eq("isbn", row.isbn))
            .unique();
          if (!titleDoc) {
            throw new Error(`Title not found for opening balance ${row.isbn}`);
          }
          await appendInventoryMovement(ctx, {
            titleId: titleDoc._id,
            kind: "openingBalance",
            quantity: row.quantity,
            reason: row.reason,
            sourceId: `openingBalance:${titleDoc._id}`,
          });
          await remember(ctx, sourceId, "title", titleDoc._id);
          break;
        }
        default: {
          const unhandled: never = row;
          throw new Error(`Unhandled import row: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    return report;
}

export const dryRun = mutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    await requireStaff(ctx);
    return dryRunImport(parseImportRows(rows));
  },
});

const applyArgs = {
  rows: v.array(v.any()),
  expectedDigest: v.string(),
};

export const apply = mutation({
  args: applyArgs,
  handler: async (ctx, { rows, expectedDigest }) => {
    await requireStaff(ctx);
    return await applyRows(ctx, parseImportRows(rows), expectedDigest);
  },
});

export const applyFromScript = internalMutation({
  args: applyArgs,
  handler: async (ctx, { rows, expectedDigest }) =>
    await applyRows(ctx, parseImportRows(rows), expectedDigest),
});
