import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
const stock = { quantityOnHand:v.number(), activeReservedQuantity:v.number() };
export default defineSchema({
  staff:defineTable({ clerkId:v.string(), email:v.string() }).index("by_clerkId",["clerkId"]),
  titles:defineTable({ title:v.string(), author:v.string(), isbn:v.string(), ...stock, notes:v.optional(v.string()), synopsis:v.optional(v.string()), coverUrl:v.optional(v.string()), reorderNeeded:v.boolean() }).index("by_isbn",["isbn"]),
  people:defineTable({
    name:v.string(),
    email:v.optional(v.string()),
    roles:v.array(
      v.union(
        v.literal("donor"),
        v.literal("professional"),
        v.literal("volunteer"),
        v.literal("schoolStaff"),
        v.literal("board"),
        v.literal("reader"),
        v.literal("reviewer"),
      ),
    ),
  }),
  schools:defineTable({ name:v.string(), normalizedName:v.string(), address:v.string(), normalizedAddress:v.string() }).index("by_normalized",["normalizedName","normalizedAddress"]),
  schoolContacts:defineTable({ schoolId:v.id("schools"), personId:v.id("people") }).index("by_school",["schoolId"]).index("by_person",["personId"]),
  suppliers:defineTable({ name:v.string(), contact:v.optional(v.string()) }),
  orders:defineTable({ supplierId:v.id("suppliers"), status:v.union(v.literal("needed"),v.literal("ordered"),v.literal("received")), expectedAt:v.optional(v.number()) }),
  orderLines:defineTable({ orderId:v.id("orders"), titleId:v.id("titles"), orderedQuantity:v.number(), receivedQuantity:v.number() }).index("by_order",["orderId"]),
  inventoryMovements:defineTable({ titleId:v.id("titles"), kind:v.union(v.literal("openingBalance"),v.literal("receipt"),v.literal("adjustment"),v.literal("donation"),v.literal("reservation"),v.literal("release"),v.literal("reservationConsumption")), quantity:v.number(), reason:v.optional(v.string()), sourceId:v.string(), createdAt:v.number() }).index("by_title",["titleId"]).index("by_source",["sourceId"]),
  schoolRequests: defineTable({
    schoolId: v.optional(v.id("schools")),
    schoolName: v.string(),
    schoolAddress: v.string(),
    contactName: v.string(),
    email: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("declined"),
    ),
    matchStatus: v.union(
      v.literal("attached"),
      v.literal("unmatched"),
      v.literal("ambiguous"),
    ),
    reference: v.string(),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status_created", ["status", "createdAt"])
    .index("by_school_status", ["schoolId", "status"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
  reservations: defineTable({
    titleId: v.id("titles"),
    schoolRequestId: v.id("schoolRequests"),
    quantity: v.number(),
    active: v.boolean(),
  })
    .index("by_title_active", ["titleId", "active"])
    .index("by_request", ["schoolRequestId"]),
  visits:defineTable({ schoolId:v.id("schools"), occurredAt:v.number(), followUp:v.optional(v.string()), effectGeneration:v.number() }).index("by_school",["schoolId"]),
  visitPeople:defineTable({ visitId:v.id("visits"), personId:v.id("people"), kind:v.union(v.literal("staff"),v.literal("reader")) }).index("by_visit",["visitId"]).index("by_person",["personId"]),
  visitBooks:defineTable({ visitId:v.id("visits"), titleId:v.id("titles"), donatedQuantity:v.number(), readAloud:v.boolean(), consumptionStatus:v.union(v.literal("consumed"),v.literal("none"),v.literal("ambiguous")), consumedReservationId:v.optional(v.id("reservations")), consumedQuantity:v.number() }).index("by_visit",["visitId"]),
  reviews:defineTable({ titleId:v.id("titles"), reviewer:v.string(), feedback:v.string(), score:v.number(), approved:v.boolean() }),
  pendingIntake:defineTable({ sourceId:v.string(), fingerprint:v.string(), payload:v.string(), status:v.string(), resolvedRecordId:v.optional(v.string()), receivedAt:v.number() }).index("by_source",["sourceId"])
});
