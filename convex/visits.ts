import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { staffMutation, staffQuery } from "./lib/auth";
import * as lifecycle from "./lib/visitLifecycle";
import {
  personParticipation,
  titleParticipation,
} from "../lib/domain/visits";

export const saveVisit = staffMutation({
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
  handler: async (ctx, args) => {
    return await lifecycle.saveVisit(ctx, args);
  },
});

export const deleteVisit = staffMutation({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
    return await lifecycle.deleteVisit(ctx, visitId);
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

export const listVisits = staffQuery({
  args: {},
  handler: async (ctx) => {
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

export const getVisit = staffQuery({
  args: { visitId: v.id("visits") },
  handler: async (ctx, { visitId }) => {
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

export const listTitleParticipation = staffQuery({
  args: { titleId: v.id("titles") },
  handler: async (ctx, { titleId }) => {
    const rows = await ctx.db.query("visitBooks").collect();
    return titleParticipation(rows, titleId);
  },
});

export const listPersonParticipation = staffQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const rows = await ctx.db
      .query("visitPeople")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect();
    return personParticipation(rows, personId);
  },
});

export const listConsumptionExceptions = staffQuery({
  args: {},
  handler: async (ctx) => {
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
