// Inventory mutations belong here so every stock event appends a movement before updating a title projection.
// They are wired after `npx convex dev` generates the deployment-specific function API.
export { availableToRequest, createsShortage } from "./lib/availability";
