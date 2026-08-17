import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { appendInventoryMovement } from "./inventory";
import { availableToRequest } from "./lib/availability";
import { requireStaff } from "./lib/auth";
import { positiveInteger, required } from "./lib/validation";
import { matchSchool } from "../lib/domain/requests";
import type { RequestStatus } from "../lib/domain/types";

const referenceAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createReference() {
  const suffix = Array.from(
    { length: 8 },
    () =>
      referenceAlphabet[
        Math.floor(Math.random() * referenceAlphabet.length)
      ],
  ).join("");
  return `JFB-${suffix}`;
}

async function requestDetails(
  ctx: QueryCtx,
  request: Doc<"schoolRequests">,
) {
  const reservations = await ctx.db
    .query("reservations")
    .withIndex("by_request", (q) =>
      q.eq("schoolRequestId", request._id),
    )
    .collect();
  const lines = await Promise.all(
    reservations
      .filter((reservation) => reservation.active)
      .map(async (reservation) => {
        const title = await ctx.db.get(reservation.titleId);
        if (!title) {
          throw new Error("Title not found");
        }
        return {
          reservationId: reservation._id,
          titleId: title._id,
          titleName: title.title,
          isbn: title.isbn,
          quantity: reservation.quantity,
          shortage:
            title.quantityOnHand < title.activeReservedQuantity,
        };
      }),
  );
  return {
    ...request,
    lines,
    hasShortage: lines.some((line) => line.shortage),
  };
}

export const internalSubmit = internalMutation({
  args: {
    schoolName: v.string(),
    address: v.string(),
    contactName: v.string(),
    email: v.string(),
    lines: v.array(
      v.object({
        isbn: v.string(),
        quantity: v.number(),
      }),
    ),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      schoolName,
      address,
      contactName,
      email,
      lines,
      idempotencyKey,
    },
  ) => {
    const cleanIdempotencyKey =
      idempotencyKey === undefined
        ? undefined
        : required(idempotencyKey, "Idempotency key");
    if (cleanIdempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("schoolRequests")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", cleanIdempotencyKey),
        )
        .unique();
      if (existing) {
        return { reference: existing.reference };
      }
    }

    const cleanSchoolName = required(schoolName, "School name");
    const cleanAddress = required(address, "School address");
    const cleanContactName = required(contactName, "Contact name");
    const cleanEmail = required(email, "Email");
    if (lines.length === 0) {
      throw new Error("Choose at least one title");
    }

    const isbns = new Set<string>();
    const preparedLines = await Promise.all(
      lines.map(async (line) => {
        const isbn = required(line.isbn, "ISBN");
        positiveInteger(line.quantity);
        if (isbns.has(isbn)) {
          throw new Error("A title can appear only once in a request");
        }
        isbns.add(isbn);
        const title = await ctx.db
          .query("titles")
          .withIndex("by_isbn", (q) => q.eq("isbn", isbn))
          .unique();
        if (!title) {
          throw new Error("Title is not available");
        }
        if (
          line.quantity >
          availableToRequest(
            title.quantityOnHand,
            title.activeReservedQuantity,
          )
        ) {
          throw new Error("Those copies are no longer available");
        }
        return {
          title,
          quantity: line.quantity,
        };
      }),
    );

    const schools = await ctx.db.query("schools").collect();
    const schoolMatch = matchSchool({
      name: cleanSchoolName,
      address: cleanAddress,
      schools: schools.map((school) => ({
        id: school._id,
        normalizedName: school.normalizedName,
        normalizedAddress: school.normalizedAddress,
      })),
    });
    const attachedSchool =
      schoolMatch.matchStatus === "attached"
        ? schools.find((school) => school._id === schoolMatch.schoolId)
        : undefined;
    if (schoolMatch.matchStatus === "attached" && !attachedSchool) {
      throw new Error("Matched school not found");
    }

    const reference = createReference();
    const requestId = await ctx.db.insert("schoolRequests", {
      ...(attachedSchool === undefined
        ? {}
        : { schoolId: attachedSchool._id }),
      schoolName: cleanSchoolName,
      schoolAddress: cleanAddress,
      contactName: cleanContactName,
      email: cleanEmail,
      status: "active",
      matchStatus: schoolMatch.matchStatus,
      reference,
      ...(cleanIdempotencyKey === undefined
        ? {}
        : { idempotencyKey: cleanIdempotencyKey }),
      createdAt: Date.now(),
    });

    for (const line of preparedLines) {
      await ctx.db.insert("reservations", {
        titleId: line.title._id,
        schoolRequestId: requestId,
        quantity: line.quantity,
        active: true,
      });
      await appendInventoryMovement(ctx, {
        titleId: line.title._id,
        kind: "reservation",
        quantity: line.quantity,
        sourceId: `reservation:${requestId}:${line.title._id}`,
      });
    }
    return { reference };
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const requests = await ctx.db
      .query("schoolRequests")
      .withIndex("by_status_created", (q) =>
        q.eq("status", "active"),
      )
      .order("asc")
      .collect();
    return await Promise.all(
      requests.map((request) => requestDetails(ctx, request)),
    );
  },
});

export const listExceptions = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const requests = await ctx.db
      .query("schoolRequests")
      .withIndex("by_status_created", (q) =>
        q.eq("status", "active"),
      )
      .order("asc")
      .collect();
    const detailed = await Promise.all(
      requests.map((request) => requestDetails(ctx, request)),
    );
    return detailed.filter(
      (request) =>
        request.matchStatus !== "attached" || request.hasShortage,
    );
  },
});

export const resolveRequest = mutation({
  args: {
    requestId: v.id("schoolRequests"),
    resolution: v.union(
      v.literal("cancelled"),
      v.literal("declined"),
    ),
  },
  handler: async (ctx, { requestId, resolution }) => {
    await requireStaff(ctx);
    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new Error("School request not found");
    }
    if (request.status !== "active") {
      return requestId;
    }

    let nextStatus: Exclude<RequestStatus, "active">;
    switch (resolution) {
      case "cancelled":
        nextStatus = "cancelled";
        break;
      case "declined":
        nextStatus = "declined";
        break;
      default: {
        const unhandledResolution: never = resolution;
        throw new Error(
          `Unhandled request resolution: ${unhandledResolution}`,
        );
      }
    }

    const reservations = await ctx.db
      .query("reservations")
      .withIndex("by_request", (q) =>
        q.eq("schoolRequestId", requestId),
      )
      .collect();
    for (const reservation of reservations) {
      if (!reservation.active) {
        continue;
      }
      await appendInventoryMovement(ctx, {
        titleId: reservation.titleId,
        kind: "release",
        quantity: reservation.quantity,
        sourceId: `release:${requestId}:${reservation.titleId}`,
      });
      await ctx.db.patch(reservation._id, { active: false });
    }
    await ctx.db.patch(requestId, { status: nextStatus });
    return requestId;
  },
});
