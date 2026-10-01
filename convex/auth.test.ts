/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { anyApi, type ApiFromModules } from "convex/server";
import { v } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { staffAction, staffMutation, staffQuery } from "./lib/auth";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe.each(["query", "mutation", "action"] as const)("staff %s registration", (kind) => {
  function setup() {
    const handler = vi.fn((ctx: { identity: { subject: string } }, args: { value: string }) =>
      `${ctx.identity.subject}:${args.value}`,
    );
    const definition = { args: { value: v.string() }, returns: v.string(), handler };
    // These handlers deliberately contain no manual authorization check.
    const functions = {
      query: staffQuery(definition),
      mutation: staffMutation(definition),
      action: staffAction(definition),
    };
    const t = convexTest(schema, {
      ...modules,
      "./authTest.ts": async () => functions,
    });
    const api = anyApi as unknown as ApiFromModules<{ authTest: typeof functions }>;
    function invoke(caller: ReturnType<typeof t.withIdentity>, args: { value: string }) {
      switch (kind) {
        case "query": return caller.query(api.authTest.query, args);
        case "mutation": return caller.mutation(api.authTest.mutation, args);
        case "action": return caller.action(api.authTest.action, args);
      }
    }
    return { t, handler, invoke };
  }

  it.each([
    [undefined, "Authentication required"],
    ["outsider", "Staff membership required"],
  ])("rejects %s before running business behavior", async (subject, message) => {
    const { t, handler, invoke } = setup();
    // A staff row exists, but belongs to a different identity.
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "staff@example.com" });
    const caller = subject === undefined ? t : t.withIdentity({ subject });
    await expect(invoke(caller, { value: "payload" })).rejects.toThrow(message);
    expect(handler).not.toHaveBeenCalled();
  });

  it("provides staff identity and unchanged arguments, then respects revocation", async () => {
    const { t, handler, invoke } = setup();
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "staff@example.com" });
    const caller = t.withIdentity({ subject: "staff_1" });
    await expect(invoke(caller, { value: "payload" })).resolves.toBe("staff_1:payload");
    expect(handler).toHaveBeenCalledTimes(1);
    await t.mutation(internal.staff.removeStaff, { clerkId: "staff_1" });
    await expect(invoke(caller, { value: "payload" })).rejects.toThrow("Staff membership required");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("preserves argument validators", async () => {
    const { t, handler, invoke } = setup();
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "staff@example.com" });
    await expect(
      // @ts-expect-error Deliberately send an invalid argument to the registered function.
      invoke(t.withIdentity({ subject: "staff_1" }), { value: 42 }),
    ).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
