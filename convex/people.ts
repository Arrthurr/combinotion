import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { required } from "./lib/validation";
import type { Role } from "../lib/domain/types";

const role = v.union(
  v.literal("donor"),
  v.literal("professional"),
  v.literal("volunteer"),
  v.literal("schoolStaff"),
  v.literal("board"),
  v.literal("reader"),
  v.literal("reviewer"),
);

function validatedRoles(roles: Role[]) {
  if (roles.length === 0) {
    throw new Error("Choose at least one role");
  }
  if (new Set(roles).size !== roles.length) {
    throw new Error("Roles must be unique");
  }
  return roles;
}

export const createPerson = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    roles: v.array(role),
  },
  handler: async (ctx, { name, email, roles }) => {
    await requireStaff(ctx);
    const cleanEmail = email?.trim();
    return await ctx.db.insert("people", {
      name: required(name, "Name"),
      ...(cleanEmail ? { email: cleanEmail } : {}),
      roles: validatedRoles(roles),
    });
  },
});

export const listPeople = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const people = await ctx.db.query("people").collect();
    return people.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const setRoles = mutation({
  args: {
    personId: v.id("people"),
    roles: v.array(role),
  },
  handler: async (ctx, { personId, roles }) => {
    await requireStaff(ctx);
    const person = await ctx.db.get(personId);
    if (!person) {
      throw new Error("Person not found");
    }
    await ctx.db.patch(personId, { roles: validatedRoles(roles) });
    return personId;
  },
});
