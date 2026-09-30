/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { resolveDonor, resolveSchool } from "./lib/resolution";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff",
    email: "staff@example.com",
  });
  return { t, staff: t.withIdentity({ subject: "staff" }) };
}

const donor = {
  name: "Ada Donor",
  email: "ada@example.com",
  schoolName: "Joy School",
  schoolAddress: "2 Oak Street",
};

describe("donor and school resolution", () => {
  it("reuses normalized identities, preserves roles, and returns the same contact on replay", async () => {
    const { t, staff } = await setup();
    const personId = await staff.mutation(api.people.createPerson, {
      name: "Original Ada",
      email: "ADA@EXAMPLE.COM",
      roles: ["schoolStaff"],
    });
    const schoolId = await staff.mutation(api.schools.createSchool, {
      name: "  JOY   SCHOOL ",
      address: "2 OAK STREET",
    });
    const first = await t.run((ctx) => resolveDonor(ctx, donor));
    const second = await t.run((ctx) =>
      resolveDonor(ctx, { ...donor, email: " Ada@Example.com " }),
    );
    expect(first).toMatchObject({ personId, schoolId, created: false });
    expect(second).toEqual(first);
    expect(await staff.query(api.people.listPeople, {})).toEqual([
      expect.objectContaining({
        _id: personId,
        name: "Original Ada",
        roles: ["schoolStaff", "donor"],
      }),
    ]);
    expect(await staff.query(api.schools.listSchools, {})).toHaveLength(1);
    expect(await staff.query(api.schools.listContacts, { schoolId })).toEqual([
      expect.objectContaining({ _id: first.contactId, personId }),
    ]);
  });

  it("creates unmatched identities once and supports absent or incomplete school data", async () => {
    const { t, staff } = await setup();
    const first = await t.run((ctx) => resolveDonor(ctx, donor));
    expect(first.created).toBe(true);
    expect(await t.run((ctx) => resolveDonor(ctx, donor))).toMatchObject({
      personId: first.personId,
      schoolId: first.schoolId,
      contactId: first.contactId,
      created: false,
    });
    await t.run((ctx) =>
      resolveDonor(ctx, { name: "No school", email: "none@example.com" }),
    );
    await t.run((ctx) =>
      resolveDonor(ctx, {
        name: "Partial school",
        email: "partial@example.com",
        schoolName: donor.schoolName,
        schoolAddress: "  ",
      }),
    );
    expect(await staff.query(api.schools.listSchools, {})).toHaveLength(1);
    expect(await staff.query(api.people.listPeople, {})).toHaveLength(3);
  });

  it("does not auto-select duplicate emails or duplicate exact schools", async () => {
    const { t, staff } = await setup();
    for (const name of ["Ada One", "Ada Two"]) {
      await staff.mutation(api.people.createPerson, {
        name,
        email: donor.email,
        roles: ["reader"],
      });
    }
    expect(
      await t.run((ctx) => resolveDonor(ctx, donor, "automatic")),
    ).toBeNull();
    await expect(
      t.run((ctx) =>
        resolveDonor(ctx, { name: donor.name, email: donor.email }),
      ),
    ).rejects.toThrow("Multiple people");
    const first = await t.run((ctx) =>
      resolveSchool(
        ctx,
        { name: donor.schoolName, address: donor.schoolAddress },
        "migration",
      ),
    );
    await t.run((ctx) =>
      resolveSchool(
        ctx,
        { name: donor.schoolName, address: donor.schoolAddress },
        "migration",
      ),
    );
    expect(
      await t.run((ctx) =>
        resolveSchool(
          ctx,
          { name: donor.schoolName, address: donor.schoolAddress },
          "match",
        ),
      ),
    ).toEqual({ matchStatus: "ambiguous" });
    expect(await t.run((ctx) => resolveSchool(ctx, {}, "match"))).toEqual({
      matchStatus: "unmatched",
    });
    if (first.matchStatus !== "attached")
      throw new Error("Expected imported school");
    const [person] = await staff.query(api.people.listPeople, {});
    const selected = await t.run((ctx) =>
      resolveDonor(ctx, {
        ...donor,
        personId: person._id,
        schoolId: first.schoolId,
      }),
    );
    expect(selected).toMatchObject({
      personId: person._id,
      schoolId: first.schoolId,
      created: false,
    });
  });

  it("keeps manual and bulk ambiguity failures pending without partial writes, then accepts explicit choices", async () => {
    const { t, staff } = await setup();
    const schoolId = await staff.mutation(api.schools.createSchool, {
      name: donor.schoolName,
      address: "9 Different Road",
    });
    const feedId = await staff.mutation(api.intake.saveFeedConfig, {
      kind: "donationApplications",
      spreadsheetId: "sheet",
      tabName: "Responses",
      mapping: {
        identityColumns: ["Email"],
        nameColumn: "Name",
        emailColumn: "Email",
      },
    });
    await t.mutation(internal.intake.recordRows, {
      feedId,
      rows: [
        {
          sourceId: "ambiguous",
          fingerprint: "v1",
          rawValues: "[]",
          outcome: {
            kind: "candidate",
            candidate: { kind: "donationApplication", ...donor },
          },
        },
      ],
    });
    const [item] = await staff.query(api.intake.listItems, {
      state: "pending",
    });
    const args = { itemId: item.itemId, fingerprint: item.fingerprint };
    await expect(
      staff.mutation(api.intake.resolveItem, {
        ...args,
        action: { kind: "createPerson", ...donor },
      }),
    ).rejects.toThrow("ambiguous");
    expect(
      await staff.mutation(api.intake.createPendingDonations, {}),
    ).toMatchObject({ failures: 1, created: 0 });
    expect(await staff.query(api.people.listPeople, {})).toHaveLength(0);
    expect(await staff.query(api.schools.listSchools, {})).toHaveLength(1);
    const result = await staff.mutation(api.intake.resolveItem, {
      ...args,
      action: { kind: "createPerson", ...donor, schoolId },
    });
    expect(result).toMatchObject({
      kind: "createdRecord",
      record: { kind: "person" },
    });
    expect(
      await staff.query(api.schools.listContacts, { schoolId }),
    ).toHaveLength(1);
    expect(
      await staff.mutation(api.intake.resolveItem, {
        ...args,
        action: { kind: "createPerson", ...donor, schoolId },
      }),
    ).toEqual(result);
  });

  it("automatic donor reuse adds the affiliation and donor role rather than merely resolving the source", async () => {
    const { t, staff } = await setup();
    const personId = await staff.mutation(api.people.createPerson, {
      name: donor.name,
      email: donor.email,
      roles: ["reader"],
    });
    const result = await t.run((ctx) => resolveDonor(ctx, donor, "automatic"));
    expect(result).toMatchObject({ personId, created: false });
    expect((await staff.query(api.people.listPeople, {}))[0].roles).toEqual([
      "reader",
      "donor",
    ]);
    expect(
      await staff.query(api.schools.listContacts, {
        schoolId: result!.schoolId!,
      }),
    ).toHaveLength(1);
  });
});
