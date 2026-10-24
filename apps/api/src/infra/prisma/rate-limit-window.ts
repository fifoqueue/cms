import type { RateRule } from '@cms/sdk';

/** One key's counter: hits in the window that began at `windowStart`, and any block. */
export interface Bucket {
  windowStart: Date;
  hits: number;
  blockedUntil: Date | null;
}

export const windowEnd = (bucket: Bucket, rule: RateRule) =>
  new Date(bucket.windowStart.getTime() + rule.windowSeconds * 1000);

export const isExceeded = (
  bucket: Bucket | null | undefined,
  rule: RateRule,
  now: Date,
) =>
  !!bucket &&
  ((bucket.blockedUntil !== null && bucket.blockedUntil > now) ||
    (windowEnd(bucket, rule) > now && bucket.hits >= rule.max));

/** The bucket after one more hit at `now`, and whether that hit is refused. */
export const nextBucket = (
  current: Bucket | undefined,
  rule: RateRule,
  now: Date,
) => {
  const fresh = !current || windowEnd(current, rule) <= now;
  const next: Bucket = {
    windowStart: fresh ? now : current.windowStart,
    hits: (fresh ? 0 : current.hits) + 1,
    blockedUntil:
      current?.blockedUntil && current.blockedUntil > now
        ? current.blockedUntil
        : null,
  };
  const over = next.hits > rule.max;
  if (over && !next.blockedUntil)
    next.blockedUntil = rule.blockSeconds
      ? new Date(now.getTime() + rule.blockSeconds * 1000)
      : windowEnd(next, rule);
  return {
    next,
    exceeded: over || (!!current?.blockedUntil && current.blockedUntil > now),
  };
};
