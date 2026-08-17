import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { availableToRequest } from "./lib/availability";
import { requireStaff } from "./lib/auth";
import { required } from "./lib/validation";

export type TitleProjection = { title: string; author: string; isbn: string; quantityOnHand: number; activeReservedQuantity: number; notes?: string; coverUrl?: string };
export const projectRequestable = (titles: TitleProjection[]) =>
  titles
    .map(({ notes, ...title }) => ({ ...title, availableQuantity: availableToRequest(title.quantityOnHand, title.activeReservedQuantity) }))
    .filter((title) => title.availableQuantity > 0);

export const createTitle = mutation({
  args: { title: v.string(), author: v.string(), isbn: v.string() },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const title = required(args.title, "Title");
    const author = required(args.author, "Author");
    const isbn = required(args.isbn, "ISBN");
    const existing = await ctx.db.query("titles").withIndex("by_isbn", (q) => q.eq("isbn", isbn)).unique();
    if (existing) throw new Error("A title with this ISBN already exists");
    return await ctx.db.insert("titles", {
      title,
      author,
      isbn,
      quantityOnHand: 0,
      activeReservedQuantity: 0,
      reorderNeeded: false,
    });
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
  handler: async (ctx) => projectRequestable(await ctx.db.query("titles").collect()),
});
