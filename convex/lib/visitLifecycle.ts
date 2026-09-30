import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  appendInventoryMovement,
  consumeReservation,
  restoreReservation,
  reverseInventoryMovement,
} from "../inventory";
import type { ConsumptionStatus } from "../../lib/domain/types";

type VisitReservationMatch =
  | {
      consumptionStatus: Exclude<ConsumptionStatus, "consumed">;
      consumedQuantity: 0;
      reservationId?: never;
    }
  | {
      consumptionStatus: "consumed";
      consumedQuantity: number;
      reservationId: Id<"reservations">;
    };

function matchVisitReservation(
  candidates: { reservationId: Id<"reservations">; quantity: number }[],
  donatedQuantity: number,
  preferredReservationId?: Id<"reservations">,
): VisitReservationMatch {
  if (preferredReservationId !== undefined) {
    const preferred = candidates.find(
      (candidate) => candidate.reservationId === preferredReservationId,
    );
    if (preferred !== undefined) {
      return {
        consumptionStatus: "consumed",
        reservationId: preferred.reservationId,
        consumedQuantity: Math.min(donatedQuantity, preferred.quantity),
      };
    }
  }
  if (candidates.length === 0) {
    return { consumptionStatus: "none", consumedQuantity: 0 };
  }
  if (candidates.length > 1) {
    return { consumptionStatus: "ambiguous", consumedQuantity: 0 };
  }
  const [candidate] = candidates;
  return {
    consumptionStatus: "consumed",
    reservationId: candidate.reservationId,
    consumedQuantity: Math.min(donatedQuantity, candidate.quantity),
  };
}

function donationSourceId(visitId: string, titleId: string, generation: number) {
  return `donation:${visitId}:${titleId}:${generation}`;
}

function reservationConsumptionSourceId(
  visitId: string,
  reservationId: string,
  generation: number,
) {
  return `reservationConsumption:${visitId}:${reservationId}:${generation}`;
}

type VisitBookInput = {
  titleId: Id<"titles">;
  donatedQuantity: number;
  readAloud: boolean;
};

type VisitInput = {
  visitId?: Id<"visits">;
  schoolId: Id<"schools">;
  occurredAt: number;
  followUp?: string;
  staffPersonIds: Id<"people">[];
  readerPersonIds: Id<"people">[];
  books: VisitBookInput[];
};

function uniqueIds<TableName extends "people" | "titles">(
  ids: Id<TableName>[],
  label: string,
) {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} must be unique`);
  }
}

async function editableVisit(ctx: MutationCtx, visitId: Id<"visits">) {
  const visit = await ctx.db.get(visitId);
  if (visit?.origin === "notionImport") {
    throw new Error("Imported visits are read-only");
  }
  return visit;
}

async function validateVisit(ctx: MutationCtx, input: VisitInput) {
  if (!(await ctx.db.get(input.schoolId))) {
    throw new Error("School not found");
  }
  if (!Number.isFinite(input.occurredAt)) {
    throw new Error("Occurred-at date is required");
  }
  if (input.readerPersonIds.length === 0) {
    throw new Error("Choose at least one reader");
  }
  if (input.books.length === 0) {
    throw new Error("Add at least one book");
  }
  uniqueIds(input.staffPersonIds, "Staff people");
  uniqueIds(input.readerPersonIds, "Readers");
  uniqueIds(input.books.map((book) => book.titleId), "Book titles");
  for (const personId of new Set([
    ...input.staffPersonIds,
    ...input.readerPersonIds,
  ])) {
    if (!(await ctx.db.get(personId))) {
      throw new Error("Person not found");
    }
  }
  for (const book of input.books) {
    if (!Number.isInteger(book.donatedQuantity) || book.donatedQuantity < 0) {
      throw new Error("Donated quantity must be a non-negative whole number");
    }
    if (!book.readAloud && book.donatedQuantity === 0) {
      throw new Error("Each book must be read aloud or donated");
    }
    if (!(await ctx.db.get(book.titleId))) {
      throw new Error("Title not found");
    }
  }
}

// Replacement and deletion use the same undo path, before removing child rows.
async function removeVisitEffects(ctx: MutationCtx, visit: Doc<"visits">) {
  const books = await ctx.db
    .query("visitBooks")
    .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
    .collect();
  const preferredReservations = new Map(
    books.flatMap((book) =>
      book.consumptionStatus === "consumed" &&
      book.consumedReservationId !== undefined
        ? [[book.titleId, book.consumedReservationId] as const]
        : [],
    ),
  );
  for (const book of books) {
    if (book.donatedQuantity > 0) {
      await reverseInventoryMovement(
        ctx,
        donationSourceId(visit._id, book.titleId, visit.effectGeneration),
      );
    }
  }
  for (const book of books) {
    if (
      book.consumptionStatus !== "consumed" ||
      book.consumedReservationId === undefined ||
      book.consumedQuantity === 0
    ) {
      continue;
    }
    const reservation = await ctx.db.get(book.consumedReservationId);
    if (!reservation) {
      throw new Error("Consumed reservation not found");
    }
    const request = await ctx.db.get(reservation.schoolRequestId);
    // A missing or resolved request no longer has a claim to restore.
    if (request?.status !== "active") {
      continue;
    }
    await restoreReservation(ctx, {
      reservationId: reservation._id,
      quantity: book.consumedQuantity,
      sourceId: `reverse:${reservationConsumptionSourceId(
        visit._id,
        reservation._id,
        visit.effectGeneration,
      )}`,
    });
  }
  const people = await ctx.db
    .query("visitPeople")
    .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
    .collect();
  for (const person of people) {
    await ctx.db.delete(person._id);
  }
  for (const book of books) {
    await ctx.db.delete(book._id);
  }
  return preferredReservations;
}

async function activeReservationsForSchool(ctx: MutationCtx, schoolId: Id<"schools">) {
  const requests = await ctx.db
    .query("schoolRequests")
    .withIndex("by_school_status", (q) =>
      q.eq("schoolId", schoolId).eq("status", "active"),
    )
    .collect();
  const reservations = await Promise.all(
    requests.map((request) =>
      ctx.db
        .query("reservations")
        .withIndex("by_request", (q) => q.eq("schoolRequestId", request._id))
        .collect(),
    ),
  );
  return reservations.flat().filter((reservation) => reservation.active);
}

async function insertVisitBooks(
  ctx: MutationCtx,
  visit: Doc<"visits">,
  books: VisitBookInput[],
  preferredReservations: ReadonlyMap<Id<"titles">, Id<"reservations">>,
) {
  const activeReservations = await activeReservationsForSchool(ctx, visit.schoolId);
  for (const book of books) {
    let consumption: VisitReservationMatch = {
      consumptionStatus: "none",
      consumedQuantity: 0,
    };
    if (book.donatedQuantity > 0) {
      await appendInventoryMovement(ctx, {
        titleId: book.titleId,
        kind: "donation",
        quantity: book.donatedQuantity,
        sourceId: donationSourceId(visit._id, book.titleId, visit.effectGeneration),
      });
      consumption = matchVisitReservation(
        activeReservations
          .filter((reservation) =>
            reservation.titleId === book.titleId && reservation.quantity > 0,
          )
          .map((reservation) => ({
            reservationId: reservation._id,
            quantity: reservation.quantity,
          })),
        book.donatedQuantity,
        preferredReservations.get(book.titleId),
      );
    }
    if (consumption.consumptionStatus === "consumed") {
      await consumeReservation(ctx, {
        reservationId: consumption.reservationId,
        quantity: consumption.consumedQuantity,
        sourceId: reservationConsumptionSourceId(
          visit._id,
          consumption.reservationId,
          visit.effectGeneration,
        ),
      });
    }
    await ctx.db.insert("visitBooks", {
      visitId: visit._id,
      titleId: book.titleId,
      donatedQuantity: book.donatedQuantity,
      readAloud: book.readAloud,
      consumptionStatus: consumption.consumptionStatus,
      ...(consumption.consumptionStatus === "consumed"
        ? { consumedReservationId: consumption.reservationId }
        : {}),
      consumedQuantity: consumption.consumedQuantity,
    });
  }
}

// These operations run inside the caller's atomic Convex mutation. Auth stays
// at the API boundary; inventory owns reservation rows, movements, and caches.
export async function saveVisit(ctx: MutationCtx, input: VisitInput) {
  const priorVisit = input.visitId === undefined
    ? null
    : await editableVisit(ctx, input.visitId);
  await validateVisit(ctx, input);
  if (input.visitId !== undefined && !priorVisit) {
    throw new Error("Visit not found");
  }
  const followUp = input.followUp?.trim();
  const fields = {
    schoolId: input.schoolId,
    occurredAt: input.occurredAt,
    ...(followUp ? { followUp } : {}),
    effectGeneration: priorVisit ? priorVisit.effectGeneration + 1 : 1,
  };
  let visitId: Id<"visits">;
  let preferredReservations = new Map<Id<"titles">, Id<"reservations">>();
  if (priorVisit) {
    preferredReservations = await removeVisitEffects(ctx, priorVisit);
    visitId = priorVisit._id;
    await ctx.db.replace(visitId, fields);
  } else {
    visitId = await ctx.db.insert("visits", fields);
  }
  const visit = await ctx.db.get(visitId);
  if (!visit) {
    throw new Error("Visit not found");
  }
  for (const personId of input.staffPersonIds) {
    await ctx.db.insert("visitPeople", { visitId, personId, kind: "staff" });
  }
  for (const personId of input.readerPersonIds) {
    await ctx.db.insert("visitPeople", { visitId, personId, kind: "reader" });
  }
  await insertVisitBooks(ctx, visit, input.books, preferredReservations);
  return visitId;
}

export async function deleteVisit(ctx: MutationCtx, visitId: Id<"visits">) {
  const visit = await editableVisit(ctx, visitId);
  if (!visit) {
    return null;
  }
  await removeVisitEffects(ctx, visit);
  await ctx.db.delete(visitId);
  return visitId;
}
