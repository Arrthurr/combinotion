/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function createStaffTest() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff_1",
    email: "coo@example.com",
  });
  return {
    t,
    asStaff: t.withIdentity({ subject: "staff_1" }),
  };
}

describe("schools", () => {
  it("rejects exact normalized duplicates", async () => {
    const { asStaff } = await createStaffTest();
    await asStaff.mutation(api.schools.createSchool, {
      name: "Joy School",
      address: "1 Main Street",
    });

    await expect(
      asStaff.mutation(api.schools.createSchool, {
        name: "  JOY   SCHOOL ",
        address: " 1 MAIN STREET ",
      }),
    ).rejects.toThrow("already exists");
  });

  it("adds one contact for a school and person pair", async () => {
    const { asStaff } = await createStaffTest();
    const schoolId = await asStaff.mutation(api.schools.createSchool, {
      name: "Joy School",
      address: "1 Main Street",
    });
    const personId = await asStaff.mutation(api.people.createPerson, {
      name: "Pat Reader",
      roles: ["schoolStaff"],
    });

    const first = await asStaff.mutation(api.schools.addContact, {
      schoolId,
      personId,
    });
    const second = await asStaff.mutation(api.schools.addContact, {
      schoolId,
      personId,
    });
    const contacts = await asStaff.query(api.schools.listContacts, {
      schoolId,
    });

    expect(second).toBe(first);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].person.name).toBe("Pat Reader");
  });

  it("rejects anonymous and non-staff callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.schools.listSchools, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .mutation(api.schools.createSchool, {
          name: "Joy School",
          address: "1 Main Street",
        }),
    ).rejects.toThrow("Staff membership required");
  });
});
