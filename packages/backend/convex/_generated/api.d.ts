/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as boards from "../boards.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as importNotes from "../importNotes.js";
import type * as items from "../items.js";
import type * as lib from "../lib.js";
import type * as photos from "../photos.js";
import type * as ratings from "../ratings.js";
import type * as testing from "../testing.js";
import type * as visitTypes from "../visitTypes.js";
import type * as visits from "../visits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  boards: typeof boards;
  cleanup: typeof cleanup;
  crons: typeof crons;
  http: typeof http;
  importNotes: typeof importNotes;
  items: typeof items;
  lib: typeof lib;
  photos: typeof photos;
  ratings: typeof ratings;
  testing: typeof testing;
  visitTypes: typeof visitTypes;
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
