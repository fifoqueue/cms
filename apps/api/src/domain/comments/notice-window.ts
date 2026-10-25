/** A recipient's fixed notification window as stored by a `NoticeOutbox`. */
export interface NoticeWindow {
  windowEnd: Date;
  /** Notices admitted in the current window. */
  sent: number;
  /** Notices held since the last collection (they survive the window's end until collected). */
  deferred: number;
}

/**
 * Counts one notice: a window starts with the first notice after the previous one ended. Within
 * `limit` the notice is admitted (`position` is its 1-based place in the window); past it, it is
 * held and `firstHeld` marks the first held notice since the last collection.
 */
export const countNotice = (
  current: NoticeWindow | null,
  limit: number,
  windowMs: number,
  now: Date,
) => {
  const expired = !current || current.windowEnd <= now;
  const windowEnd = expired
    ? new Date(now.getTime() + windowMs)
    : current.windowEnd;
  const sent = expired ? 0 : current.sent;
  const deferred = current?.deferred ?? 0;
  const admitted = sent < limit;
  const next: NoticeWindow = {
    windowEnd,
    sent: admitted ? sent + 1 : sent,
    deferred: admitted ? deferred : deferred + 1,
  };
  return {
    next,
    admitted,
    position: next.sent,
    firstHeld: !admitted && next.deferred === 1,
  };
};
