import { describe, expect, it } from "vitest";
import { isApprovedStaff, publicTitle } from "@/lib/domain/auth";
describe("identity boundary", () => { it("allows only approved staff", () => expect(isApprovedStaff("clerk_a", ["clerk_a"])).toBe(true)); it("does not project staff-only data publicly", () => expect(publicTitle({ title:"Book", author:"A", isbn:"1", quantityOnHand:2, activeReservedQuantity:1, notes:"private" })).not.toHaveProperty("notes")); });
