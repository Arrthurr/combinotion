/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as intake from "../intake.js";
import type * as inventory from "../inventory.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_validation from "../lib/validation.js";
import type * as schoolRequests from "../schoolRequests.js";
import type * as staff from "../staff.js";
import type * as titles from "../titles.js";
import type * as visits from "../visits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  intake: typeof intake;
  inventory: typeof inventory;
  "lib/auth": typeof lib_auth;
  "lib/availability": typeof lib_availability;
  "lib/validation": typeof lib_validation;
  schoolRequests: typeof schoolRequests;
  staff: typeof staff;
  titles: typeof titles;
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
