/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");
const malformedCreatePerson = makeFunctionReference<
  "mutation",
  { name: string; roles: string[] },
  Id<"people">
>("people:createPerson");

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

describe("people", () => {
  it("creates people with unique role tags and updates their roles", async () => {
    const { asStaff } = await createStaffTest();
    const personId = await asStaff.mutation(api.people.createPerson, {
      name: " Pat Reader ",
      email: " pat@example.com ",
      roles: ["reader", "volunteer"],
    });

    await asStaff.mutation(api.people.setRoles, {
      personId,
      roles: ["reader", "board"],
    });

    await expect(asStaff.query(api.people.listPeople, {})).resolves.toEqual([
      expect.objectContaining({
        _id: personId,
        name: "Pat Reader",
        email: "pat@example.com",
        roles: ["reader", "board"],
      }),
    ]);
  });

  it("rejects empty and duplicate role lists", async () => {
    const { asStaff } = await createStaffTest();
    await expect(
      asStaff.mutation(api.people.createPerson, {
        name: "Pat Reader",
        roles: [],
      }),
    ).rejects.toThrow("Choose at least one role");
    await expect(
      asStaff.mutation(api.people.createPerson, {
        name: "Pat Reader",
        roles: ["reader", "reader"],
      }),
    ).rejects.toThrow("Roles must be unique");
  });

  it("rejects roles outside the supported union", async () => {
    const { asStaff } = await createStaffTest();
    await expect(
      asStaff.mutation(malformedCreatePerson, {
        name: "Pat Reader",
        roles: ["astronaut"],
      }),
    ).rejects.toThrow();
  });

  it("rejects anonymous and non-staff callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.people.listPeople, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .mutation(api.people.createPerson, {
          name: "Pat Reader",
          roles: ["reader"],
        }),
    ).rejects.toThrow("Staff membership required");
  });
});
