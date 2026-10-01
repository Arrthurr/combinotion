import { v } from "convex/values";
import { staffMutation, staffQuery } from "./lib/auth";
import { required } from "./lib/validation";
import { roleValidator, type Role } from "../lib/domain/vocabulary";

function validatedRoles(roles: Role[]) {
  if (roles.length === 0) {
    throw new Error("Choose at least one role");
  }
  if (new Set(roles).size !== roles.length) {
    throw new Error("Roles must be unique");
  }
  return roles;
}

export const createPerson = staffMutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    roles: v.array(roleValidator),
  },
  handler: async (ctx, { name, email, roles }) => {
    const cleanEmail = email?.trim();
    return await ctx.db.insert("people", {
      name: required(name, "Name"),
      ...(cleanEmail ? { email: cleanEmail } : {}),
      roles: validatedRoles(roles),
    });
  },
});

export const listPeople = staffQuery({
  args: {},
  handler: async (ctx) => {
    const people = await ctx.db.query("people").collect();
    return people.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const setRoles = staffMutation({
  args: {
    personId: v.id("people"),
    roles: v.array(roleValidator),
  },
  handler: async (ctx, { personId, roles }) => {
    const person = await ctx.db.get(personId);
    if (!person) {
      throw new Error("Person not found");
    }
    await ctx.db.patch(personId, { roles: validatedRoles(roles) });
    return personId;
  },
});
