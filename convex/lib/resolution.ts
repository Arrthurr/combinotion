import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Role } from "../../lib/domain/types";
import { matchSchool, normalizeSchool } from "../../lib/domain/requests";
import { required } from "./validation";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Include legacy mixed-case/whitespace emails; never pick arbitrarily among
// duplicate identities. Names alone are not a safe person identity.
export async function peopleByEmail(ctx: QueryCtx, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const people = await ctx.db.query("people").collect();
  return people.filter((person) =>
    person.email ? normalizeEmail(person.email) === normalized : false,
  );
}

export async function resolvePerson(
  ctx: MutationCtx,
  input: {
    name: string;
    email?: string;
    roles: Role[];
    personId?: Id<"people">;
  },
  mode: "live" | "migration",
) {
  const name = required(input.name, "Name");
  const email = input.email ? normalizeEmail(input.email) : undefined;
  const matches =
    mode === "live" && !input.personId && email
      ? await peopleByEmail(ctx, email)
      : [];
  if (matches.length > 1)
    throw new Error(
      "Multiple people share this email. Choose a person to attach.",
    );
  const existing = input.personId
    ? await ctx.db.get(input.personId)
    : matches[0];
  if (input.personId && !existing) throw new Error("Person not found");
  if (existing) {
    const roles = [...new Set([...existing.roles, ...input.roles])];
    if (roles.length !== existing.roles.length)
      await ctx.db.patch(existing._id, { roles });
    return { personId: existing._id, created: false };
  }
  const personId = await ctx.db.insert("people", {
    name,
    ...(email ? { email } : {}),
    roles: input.roles,
  });
  return { personId, created: true };
}

// Public requests match only and remain exceptions when unmatched/ambiguous.
// Intake creates only complete, unmatched schools. Migration preserves each
// source identity; the import's source-id registry owns replay protection.
export async function resolveSchool(
  ctx: MutationCtx,
  input: { name?: string; address?: string; schoolId?: Id<"schools"> },
  mode: "match" | "intake" | "migration",
) {
  if (input.schoolId) {
    if (!(await ctx.db.get(input.schoolId)))
      throw new Error("School not found");
    return { matchStatus: "attached" as const, schoolId: input.schoolId };
  }
  const name = input.name?.trim() ?? "";
  const address = input.address?.trim() ?? "";
  if (mode !== "migration") {
    if (!name || !address) return { matchStatus: "unmatched" as const };
    const schools = await ctx.db.query("schools").collect();
    const match = matchSchool({
      name,
      address,
      schools: schools.map((school) => ({ id: school._id, ...school })),
    });
    if (match.matchStatus === "attached") {
      return { ...match, schoolId: match.schoolId as Id<"schools"> };
    }
    if (mode === "match") return { matchStatus: match.matchStatus };
    if (match.matchStatus === "ambiguous") {
      throw new Error(
        "School match is ambiguous. Attach to a school or correct its name and address.",
      );
    }
  }
  const schoolId = await ctx.db.insert("schools", {
    name: required(name, "School name"),
    address: required(address, "School address"),
    normalizedName: normalizeSchool(name),
    normalizedAddress: normalizeSchool(address),
  });
  return { matchStatus: "attached" as const, schoolId };
}

export async function ensureSchoolContact(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
  personId: Id<"people">,
) {
  const [school, person, contacts] = await Promise.all([
    ctx.db.get(schoolId),
    ctx.db.get(personId),
    ctx.db
      .query("schoolContacts")
      .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
      .collect(),
  ]);
  if (!school) throw new Error("School not found");
  if (!person) throw new Error("Person not found");
  const existing = contacts.find((contact) => contact.personId === personId);
  return (
    existing?._id ??
    (await ctx.db.insert("schoolContacts", { schoolId, personId }))
  );
}

type DonorInput = {
  name: string;
  email?: string;
  schoolName?: string;
  schoolAddress?: string;
  personId?: Id<"people">;
  schoolId?: Id<"schools">;
};
type DonorResolution = {
  personId: Id<"people">;
  created: boolean;
  schoolId?: Id<"schools">;
  contactId?: Id<"schoolContacts">;
};

export function resolveDonor(
  ctx: MutationCtx,
  input: DonorInput,
  mode?: "staff",
): Promise<DonorResolution>;
export function resolveDonor(
  ctx: MutationCtx,
  input: DonorInput,
  mode: "automatic",
): Promise<DonorResolution | null>;
export async function resolveDonor(
  ctx: MutationCtx,
  input: DonorInput,
  mode: "staff" | "automatic" = "staff",
): Promise<DonorResolution | null> {
  if (mode === "automatic") {
    const people = input.email ? await peopleByEmail(ctx, input.email) : [];
    const school = await resolveSchool(
      ctx,
      {
        name: input.schoolName,
        address: input.schoolAddress,
      },
      "match",
    );
    if (people.length !== 1 || school.matchStatus === "ambiguous") return null;
  }
  const school = await resolveSchool(
    ctx,
    {
      name: input.schoolName,
      address: input.schoolAddress,
      schoolId: input.schoolId,
    },
    "intake",
  );
  const person = await resolvePerson(
    ctx,
    { ...input, roles: ["donor"] },
    "live",
  );
  const schoolId =
    school.matchStatus === "attached" ? school.schoolId : undefined;
  const contactId = schoolId
    ? await ensureSchoolContact(ctx, schoolId, person.personId)
    : undefined;
  return { ...person, schoolId, contactId };
}
