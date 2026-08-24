import { internalMutation } from "../_generated/server";

const LEGACY_TABLES = [
  "books",
  "distributors",
  "donationApplications",
  "followUps",
  "intakeState",
  "inventoryAdjustments",
  "migrationMap",
  "pendingMatches",
  "personRoles",
  "processedWebhooks",
  "schoolVisits",
  "storefrontRequests",
  "users",
  "visitBooksDonated",
  "visitBooksRead",
  "visitReaders",
  "visitStaffPresent",
] as const;

type LegacyTable = (typeof LEGACY_TABLES)[number];

type LegacyDb = {
  query: (table: LegacyTable) => {
    take: (n: number) => Promise<Array<{ _id: string }>>;
  };
  delete: (id: string) => Promise<void>;
};

const PAGE = 64;

/** `npx convex run migrations/clearLegacyCrmTables:clearPage --prod` */
export const clearPage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db as unknown as LegacyDb;
    const deleted: Record<string, number> = {};
    let more = false;
    for (const table of LEGACY_TABLES) {
      const rows = await db.query(table).take(PAGE);
      for (const row of rows) {
        await db.delete(row._id);
      }
      if (rows.length > 0) {
        deleted[table] = rows.length;
      }
      if (rows.length === PAGE) {
        more = true;
      }
    }
    return { deleted, more };
  },
});
