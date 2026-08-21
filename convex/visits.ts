import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  appendInventoryMovement,
  reverseInventoryMovement,
} from "./inventory";
import { requireStaff } from "./lib/auth";
import {
  donationSourceId,
  matchVisitReservation,
  personParticipation,
  reservationConsumptionSourceId,
  titleParticipation,
} from "../lib/domain/visits";
import type { VisitReservationMatch } from "../lib/domain/visits";

type VisitBookInput = {
  titleId: Id<"titles">;
  donatedQuantity: number;
  readAloud: boolean;
};

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number`);
  }
  return value;
}

function uniqueIds<TableName extends "people" | "titles">(
  ids: Id<TableName>[],
  label: string,
) {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} must be unique`);
  }
  return ids;
}

async function requirePeople(
  ctx: MutationCtx,
  personIds: Id<"people">[],
) {
  for (const personId of personIds) {
    if (!(await ctx.db.get(personId))) {
      throw new Error("Person not found");
    }
  }
}

async function reverseVisitEffects(
  ctx: MutationCtx,
  visit: Doc<"visits">,
  books: Doc<"visitBooks">[],
) {
  for (const book of books) {
    if (book.donatedQuantity > 0) {
      await reverseInventoryMovement(
        ctx,
        donationSourceId(
          visit._id,
          book.titleId,
          visit.effectGeneration,
        ),
      );
    }
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
    if (!request) {
      throw new Error("Consumed reservation request not found");
    }
    if (request.status !== "active") {
      continue;
    }
    await reverseInventoryMovement(
      ctx,
      reservationConsumptionSourceId(
        visit._id,
        book.consumedReservationId,
        visit.effectGeneration,
      ),
    );
    await ctx.db.patch(reservation._id, {
      quantity: reservation.quantity + book.consumedQuantity,
      active: true,
    });
  }
}

async function activeReservationsForSchool(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
) {
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
        .withIndex("by_request", (q) =>
          q.eq("schoolRequestId", request._id),
        )
        .collect(),
    ),
  );
  return reservations.flat().filter((reservation) => reservation.active);
}

async function insertVisitBooks(
  ctx: MutationCtx,
  visit: Doc<"visits">,
  books: VisitBookInput[],
  preferredReservations: ReadonlyMap<
    Id<"titles">,
    Id<"reservations">
  > = new Map(),
) {
  const activeReservations = await activeReservationsForSchool(
    ctx,
    visit.schoolId,
  );
  for (const book of books) {
    let consumption: VisitReservationMatch<Id<"reservations">> = {
      consumptionStatus: "none",
      consumedQuantity: 0,
    };
    if (book.donatedQuantity > 0) {
      await appendInventoryMovement(ctx, {
        titleId: book.titleId,
        kind: "donation",
        quantity: book.donatedQuantity,
        sourceId: donationSourceId(
          visit._id,
          book.titleId,
          visit.effectGeneration,
        ),
      });
      consumption = matchVisitReservation(
        activeReservations
          .filter(
            (reservation) =>
              reservation.titleId === book.titleId &&
              reservation.quantity > 0,
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
      const reservation = await ctx.db.get(consumption.reservationId);
      if (!reservation) {
        throw new Error("Reservation not found");
      }
      await appendInventoryMovement(ctx, {
        titleId: book.titleId,
        kind: "reservationConsumption",
        quantity: consumption.consumedQuantity,
        sourceId: reservationConsumptionSourceId(
          visit._id,
          reservation._id,
          visit.effectGeneration,
        ),
      });
      const remaining = reservation.quantity - consumption.consumedQuantity;
      await ctx.db.patch(reservation._id, {
        quantity: remaining,
        active: remaining > 0,
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

async function deleteVisitChildren(
  ctx: MutationCtx,
  visitId: Id<"visits">,
  books: Doc<"visitBooks">[],
) {
  const people = await ctx.db
    .query("visitPeople")
    .withIndex("by_visit", (q) => q.eq("visitId", visitId))
    .collect();
  for (const person of people) {
    await ctx.db.delete(person._id);
  }
  for (const book of books) {
    await ctx.db.delete(book._id);
  }
}

export const saveVisit = mutation({
  args: {
    visitId: v.optional(v.id("visits")),
    schoolId: v.id("schools"),
    occurredAt: v.number(),
    followUp: v.optional(v.string()),
    staffPersonIds: v.array(v.id("people")),
    readerPersonIds: v.array(v.id("people")),
    books: v.array(
      v.object({
        titleId: v.id("titles"),
        donatedQuantity: v.number(),
        readAloud: v.boolean(),
      }),
    ),
  },
  handler: async (
    ctx,
    {
      visitId,
      schoolId,
      occurredAt,
      followUp,
      staffPersonIds,
      readerPersonIds,
      books,
    },
  ) => {
    await requireStaff(ctx);
    if (visitId !== undefined) {
      const existingVisit = await ctx.db.get(visitId);
      if (existingVisit?.origin === "notionImport") {
        throw new Error("Imported visits are read-only");
      }
    }
    if (!(await ctx.db.get(schoolId))) {
      throw new Error("School not found");
    }
    if (!Number.isFinite(occurredAt)) {
      throw new Error("Occurred-at date is required");
    }
    if (readerPersonIds.length === 0) {
      throw new Error("Choose at least one reader");
    }
    if (books.length === 0) {
      throw new Error("Add at least one book");
    }
    uniqueIds(staffPersonIds, "Staff people");
    uniqueIds(readerPersonIds, "Readers");
    uniqueIds(
      books.map((book) => book.titleId),
      "Book titles",
    );
    await requirePeople(
      ctx,
      [...new Set([...staffPersonIds, ...readerPersonIds])],
    );
    for (const book of books) {
      nonNegativeInteger(book.donatedQuantity, "Donated quantity");
      if (!book.readAloud && book.donatedQuantity === 0) {
        throw new Error("Each book must be read aloud or donated");
      }
      if (!(await ctx.db.get(book.titleId))) {
        throw new Error("Title not found");
      }
    }
    const cleanFollowUp = followUp?.trim();

    let savedVisit: Doc<"visits">;
    let preferredReservations = new Map<
      Id<"titles">,
      Id<"reservations">
    >();
    if (visitId === undefined) {
      const newVisitId = await ctx.db.insert("visits", {
        schoolId,
        occurredAt,
        ...(cleanFollowUp ? { followUp: cleanFollowUp } : {}),
        effectGeneration: 1,
      });
      const visit = await ctx.db.get(newVisitId);
      if (!visit) {
        throw new Error("Visit not found");
      }
      savedVisit = visit;
    } else {
      const visit = await ctx.db.get(visitId);
      if (!visit) {
        throw new Error("Visit not found");
      }
      const priorBooks = await ctx.db
        .query("visitBooks")
        .withIndex("by_visit", (q) => q.eq("visitId", visitId))
        .collect();
      preferredReservations = new Map(
        priorBooks.flatMap((book) =>
          book.consumptionStatus === "consumed" &&
          book.consumedReservationId !== undefined
            ? [[book.titleId, book.consumedReservationId] as const]
            : [],
        ),
      );
      await reverseVisitEffects(ctx, visit, priorBooks);
      await deleteVisitChildren(ctx, visitId, priorBooks);
      await ctx.db.replace(visitId, {
        schoolId,
        occurredAt,
        ...(cleanFollowUp ? { followUp: cleanFollowUp } : {}),
        effectGeneration: visit.effectGeneration + 1,
      });
      const updatedVisit = await ctx.db.get(visitId);
      if (!updatedVisit) {
        throw new Error("Visit not found");
      }
      savedVisit = updatedVisit;
    }

    for (const personId of staffPersonIds) {
      await ctx.db.insert("visitPeople", {
        visitId: savedVisit._id,
        personId,
        kind: "staff",
      });
    }
    for (const personId of readerPersonIds) {
      await ctx.db.insert("visitPeople", {
        visitId: savedVisit._id,
        personId,
        kind: "reader",
      });
    }
    await insertVisitBooks(
      ctx,
      savedVisit,
      books,
      preferredReservations,
    );
    return savedVisit._id;
  },
});

export const importHistoricalVisit = mutation({
  args: {
    importSourceId: v.string(),
    schoolId: v.id("schools"),
    occurredAt: v.number(),
    followUp: v.optional(v.string()),
    staffPersonIds: v.array(v.id("people")),
    readerPersonIds: v.array(v.id("people")),
    books: v.array(
      v.object({
        titleId: v.id("titles"),
        donatedQuantity: v.number(),
        readAloud: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const existing = await ctx.db
      .query("importRecords")
      .withIndex("by_source", (q) => q.eq("sourceId", args.importSourceId))
      .unique();
    if (existing) {
      return existing.recordId as Id<"visits">;
    }
    if (!(await ctx.db.get(args.schoolId))) {
      throw new Error("School not found");
    }
    if (args.readerPersonIds.length === 0) {
      throw new Error("Choose at least one reader");
    }
    if (args.books.length === 0) {
      throw new Error("Add at least one book");
    }
    const visitId = await ctx.db.insert("visits", {
      schoolId: args.schoolId,
      occurredAt: args.occurredAt,
      ...(args.followUp?.trim() ? { followUp: args.followUp.trim() } : {}),
      effectGeneration: 1,
      origin: "notionImport",
    });
    for (const personId of args.staffPersonIds) {
      await ctx.db.insert("visitPeople", {
        visitId,
        personId,
        kind: "staff",
      });
    }
    for (const personId of args.readerPersonIds) {
      await ctx.db.insert("visitPeople", {
        visitId,
        personId,
        kind: "reader",
      });
    }
    for (const book of args.books) {
      if (!(await ctx.db.get(book.titleId))) {
        throw new Error("Title not found");
      }
      await ctx.db.insert("visitBooks", {
        visitId,
        titleId: book.titleId,
        donatedQuantity: book.donatedQuantity,
        readAloud: book.readAloud,
        consumptionStatus: "none",
        consumedQuantity: 0,
      });
    }
    await ctx.db.insert("importRecords", {
      sourceId: args.importSourceId,
      recordKind: "visit",
      recordId: visitId,
      importedAt: Date.now(),
    });
    return visitId;
  },
});

export const deleteVisit = mutation({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
    await requireStaff(ctx);
    const visit = await ctx.db.get(visitId);
    if (!visit) {
      return null;
    }
    if (visit.origin === "notionImport") {
      throw new Error("Imported visits are read-only");
    }
    const books = await ctx.db
      .query("visitBooks")
      .withIndex("by_visit", (q) => q.eq("visitId", visitId))
      .collect();
    await reverseVisitEffects(ctx, visit, books);
    await deleteVisitChildren(ctx, visitId, books);
    await ctx.db.delete(visitId);
    return visitId;
  },
});

async function personDetails(
  ctx: QueryCtx,
  visitPerson: Doc<"visitPeople">,
) {
  const person = await ctx.db.get(visitPerson.personId);
  if (!person) {
    throw new Error("Person not found");
  }
  return {
    visitPersonId: visitPerson._id,
    personId: person._id,
    name: person.name,
    email: person.email,
    roles: person.roles,
  };
}

async function bookDetails(
  ctx: QueryCtx,
  visitBook: Doc<"visitBooks">,
) {
  const title = await ctx.db.get(visitBook.titleId);
  if (!title) {
    throw new Error("Title not found");
  }
  return {
    ...visitBook,
    title: title.title,
    author: title.author,
    isbn: title.isbn,
  };
}

export const listVisits = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const visits = await ctx.db.query("visits").collect();
    const detailed = await Promise.all(
      visits.map(async (visit) => {
        const [school, people, books] = await Promise.all([
          ctx.db.get(visit.schoolId),
          ctx.db
            .query("visitPeople")
            .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
            .collect(),
          ctx.db
            .query("visitBooks")
            .withIndex("by_visit", (q) => q.eq("visitId", visit._id))
            .collect(),
        ]);
        if (!school) {
          throw new Error("School not found");
        }
        return {
          ...visit,
          schoolName: school.name,
          readerCount: people.filter((person) => person.kind === "reader")
            .length,
          donatedQuantity: books.reduce(
            (total, book) => total + book.donatedQuantity,
            0,
          ),
        };
      }),
    );
    return detailed.sort(
      (left, right) => right.occurredAt - left.occurredAt,
    );
  },
});

export const getVisit = query({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
    await requireStaff(ctx);
    const visit = await ctx.db.get(visitId);
    if (!visit) {
      return null;
    }
    const [school, people, visitBooks] = await Promise.all([
      ctx.db.get(visit.schoolId),
      ctx.db
        .query("visitPeople")
        .withIndex("by_visit", (q) => q.eq("visitId", visitId))
        .collect(),
      ctx.db
        .query("visitBooks")
        .withIndex("by_visit", (q) => q.eq("visitId", visitId))
        .collect(),
    ]);
    if (!school) {
      throw new Error("School not found");
    }
    const [staffPresent, readers, books] = await Promise.all([
      Promise.all(
        people
          .filter((person) => person.kind === "staff")
          .map((person) => personDetails(ctx, person)),
      ),
      Promise.all(
        people
          .filter((person) => person.kind === "reader")
          .map((person) => personDetails(ctx, person)),
      ),
      Promise.all(visitBooks.map((book) => bookDetails(ctx, book))),
    ]);
    return {
      ...visit,
      school: {
        schoolId: school._id,
        name: school.name,
        address: school.address,
      },
      staffPresent,
      readers,
      books,
      booksRead: books.filter((book) => book.readAloud),
      booksDonated: books.filter((book) => book.donatedQuantity > 0),
    };
  },
});

export const listTitleParticipation = query({
  args: { titleId: v.id("titles") },
  handler: async (ctx, { titleId }) => {
    await requireStaff(ctx);
    const rows = await ctx.db.query("visitBooks").collect();
    return titleParticipation(rows, titleId);
  },
});

export const listPersonParticipation = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    await requireStaff(ctx);
    const rows = await ctx.db
      .query("visitPeople")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect();
    return personParticipation(rows, personId);
  },
});

export const listConsumptionExceptions = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const books = await ctx.db.query("visitBooks").collect();
    const ambiguous = books.filter(
      (book) => book.consumptionStatus === "ambiguous",
    );
    const detailed = await Promise.all(
      ambiguous.map(async (book) => {
        const [visit, title] = await Promise.all([
          ctx.db.get(book.visitId),
          ctx.db.get(book.titleId),
        ]);
        if (!visit) {
          throw new Error("Visit not found");
        }
        if (!title) {
          throw new Error("Title not found");
        }
        const school = await ctx.db.get(visit.schoolId);
        if (!school) {
          throw new Error("School not found");
        }
        return {
          ...book,
          occurredAt: visit.occurredAt,
          schoolName: school.name,
          titleName: title.title,
        };
      }),
    );
    return detailed.sort(
      (left, right) => left.occurredAt - right.occurredAt,
    );
  },
});
