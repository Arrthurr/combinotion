import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { availableToRequest } from "./lib/availability";
import { requireStaff } from "./lib/auth";
import { required } from "./lib/validation";
import { reviewState } from "../lib/domain/inventory";
import { isPublicRequestsOpen, orgThreshold } from "../lib/domain/orgSettings";
import { loadOrgSettings } from "./orgSettings";
import { outstandingQuantity } from "../lib/domain/orders";
import type { OrderStatus } from "../lib/domain/types";
import { titleParticipation } from "../lib/domain/visits";

const enrichmentSourceValidator = v.object({
  source: v.literal("openLibrary"),
  fetchedAt: v.number(),
});

const optionalCatalogValidators = {
  synopsis: v.optional(v.string()),
  notes: v.optional(v.string()),
  coverUrl: v.optional(v.string()),
  purchaseInfo: v.optional(v.string()),
  supplierIds: v.optional(v.array(v.id("suppliers"))),
  enrichmentSource: v.optional(enrichmentSourceValidator),
};

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function validatedSupplierIds(
  ctx: MutationCtx,
  supplierIds: Id<"suppliers">[] | undefined,
) {
  if (supplierIds === undefined) {
    return undefined;
  }
  const unique = [...new Set(supplierIds)];
  for (const supplierId of unique) {
    if (!(await ctx.db.get(supplierId))) {
      throw new Error("Supplier not found");
    }
  }
  return unique;
}

function validateEnrichmentSource(
  enrichmentSource:
    | { source: "openLibrary"; fetchedAt: number }
    | undefined,
) {
  if (
    enrichmentSource !== undefined &&
    !Number.isFinite(enrichmentSource.fetchedAt)
  ) {
    throw new Error("Enrichment fetch time must be finite");
  }
}

export type TitleProjection = {
  title: string;
  author: string;
  isbn: string;
  quantityOnHand: number;
  activeReservedQuantity: number;
  coverUrl?: string;
};

export type RequestableTitle = {
  title: string;
  author: string;
  isbn: string;
  availableQuantity: number;
  coverUrl?: string;
};

export type TitleWorkspace = {
  titleId: Id<"titles">;
  identity: {
    title: string;
    author: string;
    isbn: string;
    synopsis?: string;
    notes?: string;
    coverUrl?: string;
    purchaseInfo?: string;
  };
  stock: {
    quantityOnHand: number;
    activeReservedQuantity: number;
    availableQuantity: number;
    lowStock: boolean;
    shortage: boolean;
    reorderNeeded: boolean;
  };
  suppliers: {
    supplierId: Id<"suppliers">;
    name: string;
  }[];
  openOrderLines: {
    orderId: Id<"orders">;
    supplierName: string;
    status: OrderStatus;
    expectedAt?: number;
    orderedQuantity: number;
    receivedQuantity: number;
    outstandingQuantity: number;
  }[];
  activeRequests: {
    requestId: Id<"schoolRequests">;
    reference: string;
    schoolName: string;
    quantity: number;
    createdAt: number;
  }[];
  participation: {
    readAloudCount: number;
    donatedQuantity: number;
  };
  reviews: {
    reviewId: Id<"reviews">;
    reviewer: string;
    score: number;
    feedback: string;
    approved: boolean;
  }[];
};

export const projectRequestable = (titles: TitleProjection[]) =>
  titles
    .map((title): RequestableTitle => ({
      title: title.title,
      author: title.author,
      isbn: title.isbn,
      availableQuantity: availableToRequest(
        title.quantityOnHand,
        title.activeReservedQuantity,
      ),
      ...(title.coverUrl === undefined ? {} : { coverUrl: title.coverUrl }),
    }))
    .filter((title) => title.availableQuantity > 0);

export const createTitle = mutation({
  args: {
    title: v.string(),
    author: v.string(),
    isbn: v.string(),
    ...optionalCatalogValidators,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const title = required(args.title, "Title");
    const author = required(args.author, "Author");
    const isbn = required(args.isbn, "ISBN");
    const synopsis = optionalText(args.synopsis);
    const notes = optionalText(args.notes);
    const coverUrl = optionalText(args.coverUrl);
    const purchaseInfo = optionalText(args.purchaseInfo);
    const supplierIds = await validatedSupplierIds(ctx, args.supplierIds);
    validateEnrichmentSource(args.enrichmentSource);
    const existing = await ctx.db.query("titles").withIndex("by_isbn", (q) => q.eq("isbn", isbn)).unique();
    if (existing) throw new Error("A title with this ISBN already exists");
    return await ctx.db.insert("titles", {
      title,
      author,
      isbn,
      quantityOnHand: 0,
      activeReservedQuantity: 0,
      reorderNeeded: false,
      ...(synopsis === undefined ? {} : { synopsis }),
      ...(notes === undefined ? {} : { notes }),
      ...(coverUrl === undefined ? {} : { coverUrl }),
      ...(purchaseInfo === undefined ? {} : { purchaseInfo }),
      ...(supplierIds === undefined ? {} : { supplierIds }),
      ...(args.enrichmentSource === undefined
        ? {}
        : { enrichmentSource: args.enrichmentSource }),
    });
  },
});

export const updateTitle = mutation({
  args: {
    titleId: v.id("titles"),
    title: v.string(),
    author: v.string(),
    isbn: v.string(),
    ...optionalCatalogValidators,
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    if (!(await ctx.db.get(args.titleId))) {
      throw new Error("Title not found");
    }
    const title = required(args.title, "Title");
    const author = required(args.author, "Author");
    const isbn = required(args.isbn, "ISBN");
    const existing = await ctx.db
      .query("titles")
      .withIndex("by_isbn", (q) => q.eq("isbn", isbn))
      .unique();
    if (existing && existing._id !== args.titleId) {
      throw new Error("A title with this ISBN already exists");
    }
    const supplierIds = await validatedSupplierIds(ctx, args.supplierIds);
    validateEnrichmentSource(args.enrichmentSource);
    await ctx.db.patch(args.titleId, {
      title,
      author,
      isbn,
      synopsis: optionalText(args.synopsis),
      notes: optionalText(args.notes),
      coverUrl: optionalText(args.coverUrl),
      purchaseInfo: optionalText(args.purchaseInfo),
      supplierIds,
      ...(args.enrichmentSource === undefined
        ? {}
        : { enrichmentSource: args.enrichmentSource }),
    });
    return args.titleId;
  },
});

export const getTitleWorkspace = query({
  args: { titleId: v.id("titles") },
  handler: async (ctx, { titleId }): Promise<TitleWorkspace | null> => {
    await requireStaff(ctx);
    const title = await ctx.db.get(titleId);
    if (!title) {
      return null;
    }

    const [supplierRows, orderLines, reservations, visitBooks, reviews] =
      await Promise.all([
        Promise.all(
          (title.supplierIds ?? []).map(async (supplierId) => {
            const supplier = await ctx.db.get(supplierId);
            if (!supplier) {
              throw new Error("Supplier not found");
            }
            return {
              supplierId: supplier._id,
              name: supplier.name,
            };
          }),
        ),
        ctx.db
          .query("orderLines")
          .withIndex("by_title", (q) => q.eq("titleId", titleId))
          .collect(),
        ctx.db
          .query("reservations")
          .withIndex("by_title_active", (q) =>
            q.eq("titleId", titleId).eq("active", true),
          )
          .collect(),
        ctx.db.query("visitBooks").collect(),
        ctx.db
          .query("reviews")
          .withIndex("by_title", (q) => q.eq("titleId", titleId))
          .collect(),
      ]);

    const orderDetails = await Promise.all(
      orderLines.map(async (line) => {
        const order = await ctx.db.get(line.orderId);
        if (!order) {
          throw new Error("Order not found");
        }
        if (order.status === "received") {
          return null;
        }
        const supplier = await ctx.db.get(order.supplierId);
        if (!supplier) {
          throw new Error("Supplier not found");
        }
        return {
          orderId: order._id,
          supplierName: supplier.name,
          status: order.status,
          ...(order.expectedAt === undefined
            ? {}
            : { expectedAt: order.expectedAt }),
          orderedQuantity: line.orderedQuantity,
          receivedQuantity: line.receivedQuantity,
          outstandingQuantity: outstandingQuantity(
            line.orderedQuantity,
            line.receivedQuantity,
          ),
        };
      }),
    );
    const openOrderLines = orderDetails.filter(
      (line): line is NonNullable<typeof line> => line !== null,
    );

    const requestDetails = await Promise.all(
      reservations.map(async (reservation) => {
        const request = await ctx.db.get(reservation.schoolRequestId);
        if (!request) {
          throw new Error("School request not found");
        }
        if (request.status !== "active") {
          return null;
        }
        return {
          requestId: request._id,
          reference: request.reference,
          schoolName: request.schoolName,
          quantity: reservation.quantity,
          createdAt: request.createdAt,
        };
      }),
    );
    const activeRequests = requestDetails.filter(
      (request): request is NonNullable<typeof request> => request !== null,
    );
    const stockReview = reviewState(
      title,
      orgThreshold(await loadOrgSettings(ctx)),
    );

    return {
      titleId,
      identity: {
        title: title.title,
        author: title.author,
        isbn: title.isbn,
        ...(title.synopsis === undefined
          ? {}
          : { synopsis: title.synopsis }),
        ...(title.notes === undefined ? {} : { notes: title.notes }),
        ...(title.coverUrl === undefined
          ? {}
          : { coverUrl: title.coverUrl }),
        ...(title.purchaseInfo === undefined
          ? {}
          : { purchaseInfo: title.purchaseInfo }),
      },
      stock: {
        quantityOnHand: title.quantityOnHand,
        activeReservedQuantity: title.activeReservedQuantity,
        availableQuantity: availableToRequest(
          title.quantityOnHand,
          title.activeReservedQuantity,
        ),
        lowStock: stockReview.lowStock,
        shortage: stockReview.shortage,
        reorderNeeded: title.reorderNeeded,
      },
      suppliers: supplierRows,
      openOrderLines,
      activeRequests,
      participation: titleParticipation(visitBooks, titleId),
      reviews: reviews.map((review) => ({
        reviewId: review._id,
        reviewer: review.reviewer,
        score: review.score,
        feedback: review.feedback,
        approved: review.approved,
      })),
    };
  },
});

export const listTitles = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db.query("titles").collect();
  },
});

export const getTitle = query({
  args: { titleId: v.id("titles") },
  handler: async (ctx, { titleId }) => {
    await requireStaff(ctx);
    return await ctx.db.get(titleId);
  },
});

export const listRequestable = query({
  args: {},
  handler: async (ctx) => {
    if (!isPublicRequestsOpen(await loadOrgSettings(ctx))) {
      return [];
    }
    return projectRequestable(await ctx.db.query("titles").collect());
  },
});
