import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
const stock = { quantityOnHand:v.number(), activeReservedQuantity:v.number() };
export default defineSchema({
  staff:defineTable({ clerkId:v.string(), email:v.string() }).index("by_clerkId",["clerkId"]),
  titles:defineTable({ title:v.string(), author:v.string(), isbn:v.string(), ...stock, notes:v.optional(v.string()), synopsis:v.optional(v.string()), coverUrl:v.optional(v.string()), reorderNeeded:v.boolean() }).index("by_isbn",["isbn"]),
  people:defineTable({ name:v.string(), email:v.optional(v.string()), roles:v.array(v.string()) }),
  schools:defineTable({ name:v.string(), normalizedName:v.string(), address:v.string(), normalizedAddress:v.string() }).index("by_normalized",["normalizedName","normalizedAddress"]),
  suppliers:defineTable({ name:v.string(), contact:v.optional(v.string()) }),
  orders:defineTable({ supplierId:v.id("suppliers"), status:v.union(v.literal("needed"),v.literal("ordered"),v.literal("received")), expectedAt:v.optional(v.number()) }),
  orderLines:defineTable({ orderId:v.id("orders"), titleId:v.id("titles"), orderedQuantity:v.number(), receivedQuantity:v.number() }).index("by_order",["orderId"]),
  inventoryMovements:defineTable({ titleId:v.id("titles"), kind:v.string(), quantity:v.number(), reason:v.optional(v.string()), sourceId:v.string(), createdAt:v.number() }).index("by_title",["titleId"]).index("by_source",["sourceId"]),
  schoolRequests:defineTable({ schoolId:v.optional(v.id("schools")), schoolName:v.string(), status:v.string(), createdAt:v.number() }).index("by_status_created",["status","createdAt"]),
  reservations:defineTable({ titleId:v.id("titles"), schoolRequestId:v.id("schoolRequests"), quantity:v.number(), active:v.boolean() }).index("by_title_active",["titleId","active"]),
  visits:defineTable({ schoolId:v.id("schools"), occurredAt:v.number(), followUp:v.optional(v.string()) }).index("by_school",["schoolId"]),
  visitBooks:defineTable({ visitId:v.id("visits"), titleId:v.id("titles"), donatedQuantity:v.number(), readAloud:v.boolean() }).index("by_visit",["visitId"]),
  reviews:defineTable({ titleId:v.id("titles"), reviewer:v.string(), feedback:v.string(), score:v.number(), approved:v.boolean() }),
  pendingIntake:defineTable({ sourceId:v.string(), fingerprint:v.string(), payload:v.string(), status:v.string(), resolvedRecordId:v.optional(v.string()), receivedAt:v.number() }).index("by_source",["sourceId"])
});
