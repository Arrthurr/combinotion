import { v } from "convex/values";
import { staffMutation, staffQuery } from "./lib/auth";
import { required } from "./lib/validation";
import { normalizeSchool } from "../lib/domain/requests";
import { ensureSchoolContact } from "./lib/resolution";

export const createSchool = staffMutation({
  args: { name: v.string(), address: v.string() },
  handler: async (ctx, { name, address }) => {
    const cleanName = required(name, "School name");
    const cleanAddress = required(address, "School address");
    const normalizedName = normalizeSchool(cleanName);
    const normalizedAddress = normalizeSchool(cleanAddress);
    const existing = await ctx.db
      .query("schools")
      .withIndex("by_normalized", (q) =>
        q
          .eq("normalizedName", normalizedName)
          .eq("normalizedAddress", normalizedAddress),
      )
      .unique();
    if (existing) {
      throw new Error("A school with this name and address already exists");
    }
    return await ctx.db.insert("schools", {
      name: cleanName,
      normalizedName,
      address: cleanAddress,
      normalizedAddress,
    });
  },
});

export const listSchools = staffQuery({
  args: {},
  handler: async (ctx) => {
    const schools = await ctx.db.query("schools").collect();
    return schools.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const addContact = staffMutation({
  args: {
    schoolId: v.id("schools"),
    personId: v.id("people"),
  },
  handler: async (ctx, { schoolId, personId }) => {
    return await ensureSchoolContact(ctx, schoolId, personId);
  },
});

export const listContacts = staffQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const school = await ctx.db.get(schoolId);
    if (!school) {
      throw new Error("School not found");
    }
    const contacts = await ctx.db
      .query("schoolContacts")
      .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
      .collect();
    const withPeople = await Promise.all(
      contacts.map(async (contact) => {
        const person = await ctx.db.get(contact.personId);
        if (!person) {
          throw new Error("Person not found");
        }
        return { ...contact, person };
      }),
    );
    return withPeople.sort((left, right) =>
      left.person.name.localeCompare(right.person.name),
    );
  },
});
