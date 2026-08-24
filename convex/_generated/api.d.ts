/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as intake from "../intake.js";
import type * as integrations_googleSheets from "../integrations/googleSheets.js";
import type * as integrations_openLibrary from "../integrations/openLibrary.js";
import type * as inventory from "../inventory.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_validation from "../lib/validation.js";
import type * as migrations_clearLegacyCrmTables from "../migrations/clearLegacyCrmTables.js";
import type * as migrations_notionImport from "../migrations/notionImport.js";
import type * as orders from "../orders.js";
import type * as orgSettings from "../orgSettings.js";
import type * as people from "../people.js";
import type * as reports from "../reports.js";
import type * as reviews from "../reviews.js";
import type * as schoolRequests from "../schoolRequests.js";
import type * as schools from "../schools.js";
import type * as staff from "../staff.js";
import type * as suppliers from "../suppliers.js";
import type * as titles from "../titles.js";
import type * as views from "../views.js";
import type * as visitRecaps from "../visitRecaps.js";
import type * as visits from "../visits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  intake: typeof intake;
  "integrations/googleSheets": typeof integrations_googleSheets;
  "integrations/openLibrary": typeof integrations_openLibrary;
  inventory: typeof inventory;
  "lib/auth": typeof lib_auth;
  "lib/availability": typeof lib_availability;
  "lib/validation": typeof lib_validation;
  "migrations/clearLegacyCrmTables": typeof migrations_clearLegacyCrmTables;
  "migrations/notionImport": typeof migrations_notionImport;
  orders: typeof orders;
  orgSettings: typeof orgSettings;
  people: typeof people;
  reports: typeof reports;
  reviews: typeof reviews;
  schoolRequests: typeof schoolRequests;
  schools: typeof schools;
  staff: typeof staff;
  suppliers: typeof suppliers;
  titles: typeof titles;
  views: typeof views;
  visitRecaps: typeof visitRecaps;
  visits: typeof visits;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
