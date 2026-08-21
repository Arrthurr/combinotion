import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "poll-intake-feeds",
  { minutes: 15 },
  internal.intake.pollFeeds,
);

crons.daily(
  "purge-intake-raw",
  { hourUTC: 6 },
  internal.intake.purgeExpiredRaw,
);

export default crons;
