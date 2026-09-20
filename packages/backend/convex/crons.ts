import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';
const crons = cronJobs();
crons.interval(
  'Remove abandoned upload reservations',
  { minutes: 30 },
  internal.cleanup.expiredUploads,
  {},
);
crons.daily(
  'Remove orphan files older than a day',
  { hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.orphanStorage,
  { cursor: null },
);
export default crons;
