import { v } from "convex/values";
import { staffMutation, staffQuery } from "./lib/auth";
import { required } from "./lib/validation";

export const createSupplier = staffMutation({
  args: {
    name: v.string(),
    contact: v.optional(v.string()),
  },
  handler: async (ctx, { name, contact }) => {
    const cleanName = required(name, "Supplier name");
    const cleanContact = contact?.trim();
    return await ctx.db.insert("suppliers", {
      name: cleanName,
      ...(cleanContact ? { contact: cleanContact } : {}),
    });
  },
});

export const listSuppliers = staffQuery({
  args: {},
  handler: async (ctx) => {
    const suppliers = await ctx.db.query("suppliers").collect();
    return suppliers.sort((left, right) => left.name.localeCompare(right.name));
  },
});
