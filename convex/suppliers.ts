import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { required } from "./lib/validation";

export const createSupplier = mutation({
  args: {
    name: v.string(),
    contact: v.optional(v.string()),
  },
  handler: async (ctx, { name, contact }) => {
    await requireStaff(ctx);
    const cleanName = required(name, "Supplier name");
    const cleanContact = contact?.trim();
    return await ctx.db.insert("suppliers", {
      name: cleanName,
      ...(cleanContact ? { contact: cleanContact } : {}),
    });
  },
});

export const listSuppliers = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const suppliers = await ctx.db.query("suppliers").collect();
    return suppliers.sort((left, right) => left.name.localeCompare(right.name));
  },
});
