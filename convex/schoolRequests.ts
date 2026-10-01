import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import { releaseReservation, reserveTitle } from "./inventory";
import { staffMutation, staffQuery } from "./lib/auth";
import { findTitleByIsbn } from "./lib/catalog";
import { positiveInteger, required } from "./lib/validation";
import { availableQuantity, isShortage } from "../lib/domain/inventory";
import { resolveSchool } from "./lib/resolution";
import type { RequestStatus } from "../lib/domain/types";
import { loadOrgSettings } from "./orgSettings";
import { assertPublicRequestsOpen } from "../lib/domain/orgSettings";
import {
  recentSchoolRequestAttempts,
  SCHOOL_REQUEST_RATE_MAX_ATTEMPTS,
  schoolRequestRetryAfterSeconds,
} from "../lib/schoolRequestRateLimit";

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
          shortage: isShortage(title),
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
    assertPublicRequestsOpen(await loadOrgSettings(ctx));
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

    const titleIds = new Set<string>();
    const preparedLines = await Promise.all(
      lines.map(async (line) => {
        const isbn = required(line.isbn, "ISBN");
        positiveInteger(line.quantity);
        const title = await findTitleByIsbn(ctx, isbn);
        if (!title) {
          throw new Error("Title is not available");
        }
        if (titleIds.has(title._id)) {
          throw new Error("A title can appear only once in a request");
        }
        titleIds.add(title._id);
        if (line.quantity > availableQuantity(title)) {
          throw new Error("Those copies are no longer available");
        }
        return {
          title,
          quantity: line.quantity,
        };
      }),
    );

    const schoolMatch = await resolveSchool(ctx, {
      name: cleanSchoolName,
      address: cleanAddress,
    }, "match");

    const reference = createReference();
    const requestId = await ctx.db.insert("schoolRequests", {
      ...(schoolMatch.matchStatus === "attached"
        ? { schoolId: schoolMatch.schoolId as Doc<"schools">["_id"] }
        : {}),
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
      await reserveTitle(ctx, {
        titleId: line.title._id,
        schoolRequestId: requestId,
        quantity: line.quantity,
        sourceId: `reservation:${requestId}:${line.title._id}`,
      });
    }
    return { reference };
  },
});

export const listActive = staffQuery({
  args: {},
  handler: async (ctx) => {
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

export const listExceptions = staffQuery({
  args: {},
  handler: async (ctx) => {
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

export const internalConsumeRateLimit = internalMutation({
  args: { clientKey: v.string() },
  handler: async (ctx, { clientKey }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("schoolRequestRateLimits")
      .withIndex("by_clientKey", (q) => q.eq("clientKey", clientKey))
      .unique();
    const recent = recentSchoolRequestAttempts(
      existing?.attempts ?? [],
      now,
    );
    if (recent.length >= SCHOOL_REQUEST_RATE_MAX_ATTEMPTS) {
      if (existing) {
        await ctx.db.patch(existing._id, { attempts: recent });
      }
      return {
        allowed: false as const,
        retryAfterSeconds: schoolRequestRetryAfterSeconds(recent[0]!, now),
      };
    }
    recent.push(now);
    if (existing) {
      await ctx.db.patch(existing._id, { attempts: recent });
    } else {
      await ctx.db.insert("schoolRequestRateLimits", {
        clientKey,
        attempts: recent,
      });
    }
    return { allowed: true as const };
  },
});

export const resolveRequest = staffMutation({
  args: {
    requestId: v.id("schoolRequests"),
    resolution: v.union(
      v.literal("cancelled"),
      v.literal("declined"),
    ),
  },
  handler: async (ctx, { requestId, resolution }) => {
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
      await releaseReservation(ctx, {
        reservationId: reservation._id,
        sourceId: `release:${requestId}:${reservation.titleId}`,
      });
    }
    await ctx.db.patch(requestId, { status: nextStatus });
    return requestId;
  },
});
