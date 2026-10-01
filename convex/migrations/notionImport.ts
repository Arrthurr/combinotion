import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { staffMutation } from "../lib/auth";
import { normalizeIsbn } from "../../lib/domain/catalog";
import { notionSourceId } from "../../lib/domain/intake";
import {
  planImport,
  parseImportRows,
  sourceFor,
  type ImportCatalog,
  type ImportRow,
} from "../../lib/domain/notionImport";
import { resolvePerson, resolveSchool } from "../lib/resolution";
import { findTitleByIsbn } from "../lib/catalog";
import { reserveTitle, writeOpeningBalance } from "../inventory";

async function importedId(ctx: MutationCtx, sourceId: string) {
  const existing = await ctx.db
    .query("importRecords")
    .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
    .unique();
  return existing?.recordId;
}

async function loadImportCatalog(ctx: MutationCtx): Promise<ImportCatalog> {
  const [records, titles, movements] = await Promise.all([
    ctx.db.query("importRecords").collect(),
    ctx.db.query("titles").collect(),
    ctx.db.query("inventoryMovements").collect(),
  ]);
  const titleIdsWithMovements = new Set(
    movements.map((movement) => movement.titleId),
  );
  return {
    importedSourceIds: new Set(records.map((record) => record.sourceId)),
    titles: new Map(
      titles.map((title) => [
        normalizeIsbn(title.isbn) || title.isbn,
        {
          quantityOnHand: title.quantityOnHand,
          hasMovements: titleIdsWithMovements.has(title._id),
        },
      ]),
    ),
  };
}

async function idForNotion(
  ctx: MutationCtx,
  kind: "person" | "school" | "title",
  notionId: string,
  notionToId: Map<string, string>,
) {
  if (!notionId.trim()) return undefined;
  return (
    notionToId.get(notionId) ??
    (await importedId(ctx, notionSourceId(kind, notionId)))
  );
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
  const report = planImport(typedRows, await loadImportCatalog(ctx));
  if (report.digest !== expectedDigest) {
    throw new Error("Import preview is stale. Run a dry-run again.");
  }
  if (report.invalid.length > 0) {
    throw new Error(report.invalid.map((row) => row.reason).join("; "));
  }
  const rowsBySource = new Map(
    typedRows.map((row) => [sourceFor(row), row] as const),
  );
  const notionToId = new Map<string, string>();
  for (const planned of report.wouldWrite) {
    const row = rowsBySource.get(planned.sourceId);
    if (!row) {
      throw new Error(`Planned source missing: ${planned.sourceId}`);
    }
    const sourceId = planned.sourceId;
    const already = await importedId(ctx, sourceId);
    if (already) {
      if (row.kind !== "openingBalance") {
        notionToId.set(row.notionId, already);
      }
      continue;
    }
    switch (row.kind) {
      case "person": {
        const { personId: id } = await resolvePerson(
          ctx,
          {
            name: row.name,
            ...(row.email ? { email: row.email } : {}),
            roles: row.roles,
          },
          "migration",
        );
        await remember(ctx, sourceId, "person", id);
        notionToId.set(row.notionId, id);
        break;
      }
      case "school": {
        const school = await resolveSchool(
          ctx,
          {
            name: row.name,
            address: row.address,
          },
          "migration",
        );
        if (school.matchStatus !== "attached") {
          throw new Error("Imported school not resolved");
        }
        const id = school.schoolId;
        await remember(ctx, sourceId, "school", id);
        notionToId.set(row.notionId, id);
        break;
      }
      case "title": {
        const existingTitle = await findTitleByIsbn(ctx, row.isbn);
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
        const titleDoc = await findTitleByIsbn(ctx, row.isbn);
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
        const schoolId = (await idForNotion(
          ctx,
          "school",
          row.schoolNotionId,
          notionToId,
        )) as Id<"schools"> | undefined;
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
            const titleDoc = await findTitleByIsbn(ctx, line.isbn);
            if (!titleDoc) {
              throw new Error(`Title not found for request ${row.notionId}`);
            }
            await reserveTitle(ctx, {
              titleId: titleDoc._id,
              schoolRequestId: requestId,
              quantity: line.quantity,
              sourceId: `reservation:${requestId}:${titleDoc._id}`,
            });
          }
        }
        await remember(ctx, sourceId, "request", requestId);
        break;
      }
      case "visit": {
        const schoolId = (await idForNotion(
          ctx,
          "school",
          row.schoolNotionId,
          notionToId,
        )) as Id<"schools"> | undefined;
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
          const personId = (await idForNotion(
            ctx,
            "person",
            notionId,
            notionToId,
          )) as Id<"people"> | undefined;
          if (!personId) continue;
          await ctx.db.insert("visitPeople", {
            visitId,
            personId,
            kind: "staff",
          });
        }
        for (const notionId of row.readerNotionIds) {
          const personId = (await idForNotion(
            ctx,
            "person",
            notionId,
            notionToId,
          )) as Id<"people"> | undefined;
          if (!personId) continue;
          await ctx.db.insert("visitPeople", {
            visitId,
            personId,
            kind: "reader",
          });
        }
        for (const book of row.books) {
          const titleDoc = await findTitleByIsbn(ctx, book.isbn);
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
        const titleDoc = await findTitleByIsbn(ctx, row.isbn);
        if (!titleDoc) {
          throw new Error(`Title not found for opening balance ${row.isbn}`);
        }
        await writeOpeningBalance(ctx, {
          titleId: titleDoc._id,
          quantity: row.quantity,
          reason: row.reason,
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

export const dryRun = staffMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    return planImport(parseImportRows(rows), await loadImportCatalog(ctx));
  },
});

const applyArgs = {
  rows: v.array(v.any()),
  expectedDigest: v.string(),
};

export const apply = staffMutation({
  args: applyArgs,
  handler: async (ctx, { rows, expectedDigest }) => {
    return await applyRows(ctx, parseImportRows(rows), expectedDigest);
  },
});

export const applyFromScript = internalMutation({
  args: applyArgs,
  handler: async (ctx, { rows, expectedDigest }) =>
    await applyRows(ctx, parseImportRows(rows), expectedDigest),
});
