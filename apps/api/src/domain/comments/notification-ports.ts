/** Why a push registration stopped being used. */
export type PushInvalidReason =
  /** The push service answered 404/410: the browser unsubscribed. */
  | 'gone'
  /** The push service answered 401/403: VAPID key mismatch or revoked. */
  | 'rejected'
  /** The browser-reported `expirationTime` passed. */
  | 'expired'
  /** The endpoint no longer passes the push service allowlist. */
  | 'endpoint'
  /** Not registered or renewed for `PUSH_STALE_DAYS`. */
  | 'stale';

/** A browser push registration for one comment (visitor) or one user (writer). */
export interface PushSubscriptionRecord {
  id: string;
  /** Set for visitors: pushes about replies to this comment. */
  commentId: string | null;
  /** Set for users: pushes about their entries and replies to their comments. */
  userId: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The browser's `expirationTime`; null when it gave none. */
  expiresAt: Date | null;
  status: 'active' | 'invalid';
  invalidReason: PushInvalidReason | null;
  invalidatedAt: Date | null;
  /** Last registration or renewal. */
  lastSeenAt: Date;
  createdAt: Date;
}

export type PushKeys = Pick<
  PushSubscriptionRecord,
  'endpoint' | 'p256dh' | 'auth' | 'expiresAt'
>;

/**
 * Stored push registrations. Endpoints are compared exactly; an owner (comment or user) has at
 * most one row per endpoint.
 */
export interface PushSubscriptionRepository {
  /**
   * Inserts or refreshes the owner's row for `record.endpoint` (active again, new keys, seen
   * now), then deletes the owner's least recently seen rows beyond `cap`.
   */
  save(record: PushSubscriptionRecord, cap: number): Promise<void>;
  findById(id: string): Promise<PushSubscriptionRecord | null>;
  /** Active rows of a comment and/or a user. */
  active(owner: {
    commentId?: string | null;
    userId?: string | null;
  }): Promise<PushSubscriptionRecord[]>;
  /**
   * Moves every active row registered with `old.endpoint` whose stored auth secret equals
   * `old.auth` (timing-safe) to `next` and marks it seen. A row whose owner already has
   * `next.endpoint` is deleted instead. Returns the rows moved or merged; mismatches count none.
   */
  renew(
    old: { endpoint: string; auth: string },
    next: PushKeys,
    at: Date,
  ): Promise<number>;
  /** Deletes a user's row for `endpoint`. */
  removeForUser(userId: string, endpoint: string): Promise<void>;
  delete(id: string): Promise<void>;
  invalidate(
    ids: readonly string[],
    reason: PushInvalidReason,
    at: Date,
  ): Promise<void>;
  /** Active rows after `afterId`, ordered by id. */
  page(
    afterId: string | null,
    limit: number,
  ): Promise<PushSubscriptionRecord[]>;
  /** Deletes rows invalidated before `before`. */
  purge(before: Date): Promise<number>;
}

/** A durable job row written inside a notification transaction. `payload` is already sealed. */
export interface QueuedJob {
  kind: string;
  payload: unknown;
  /**
   * The comment and user ids (and email addresses) the job is about, as sealed in `payload`.
   * Implementations re-check them under the lock personal-data erasure takes and skip the job
   * when one names an erased comment or user.
   */
  subjects: readonly string[];
  /** Defaults to now. */
  runAt?: Date;
  expiresAt: Date;
}

/** Per-comment notification state kept beside the comment. */
export interface CommentNoticeState {
  /**
   * In one transaction: marks the comment announced only while it exists, is approved, is not
   * erased and was not announced, and queues `job`. True when claimed (and `job` queued); a
   * concurrent unapprove/spam either commits first (false, nothing queued) or after (true).
   * Locks the entry before the comment, the order every comment writer uses.
   */
  claim(
    comment: { id: string; contentId: string },
    at: Date,
    job: QueuedJob,
  ): Promise<boolean>;
  /**
   * Clears the announcement while the comment is not approved, so a later approval announces
   * it; false (nothing changes) when it is approved again or gone.
   */
  release(commentId: string): Promise<boolean>;
  /** Whether replies to this comment may be emailed to its author (false after unsubscribing). */
  replyMail(commentId: string): Promise<boolean>;
  muteReplyMail(commentId: string): Promise<void>;
}

/** One recipient's notice in a dispatch. */
export interface NoticeItem {
  /** As `QueuedJob.subjects`: an item naming an erased subject is skipped (and not counted). */
  subjects: readonly string[];
  /** The recipient's flood window: at most `limit` notices go out per `windowMs`. */
  window: { key: string; limit: number; windowMs: number };
  /** A thread whose notices replace each other on screen; admitted ones are counted per window. */
  thread?: { key: string; windowMs: number };
  /** Jobs for an admitted notice; `others` counts earlier admitted notices of `thread` in its window. */
  deliver(others: number): QueuedJob[];
  /** The collection job, queued for the window's end with the first held notice since the last collection. */
  collect(windowEnd: Date): QueuedJob;
}

/**
 * Durable fan-out with per-recipient flood windows, shared by every API process. Window keys may
 * contain email addresses; implementations store only their SHA-256.
 */
export interface NoticeOutbox {
  /**
   * At most once per `key` (later calls change nothing and return false), in one transaction:
   * queues `jobs`, and counts each item in its window, queuing its `deliver` jobs when admitted
   * or holding it (and queuing `collect` for the first held one) when the window is full. Jobs
   * and items naming an erased subject (re-checked under the erasure lock) are skipped.
   */
  dispatch(
    key: string,
    now: Date,
    plan: { jobs?: QueuedJob[]; items?: NoticeItem[] },
  ): Promise<boolean>;
  /**
   * In one transaction: takes the held count of `window` and queues `build(count)` when it is
   * positive, skipping jobs that name an erased subject. Returns the count taken; on failure
   * the count stays held.
   */
  collect(
    window: string,
    build: (count: number) => QueuedJob[],
  ): Promise<number>;
  /** Forgets dispatch keys and finished windows (nothing held) older than `before`. */
  purge(before: Date): Promise<void>;
}

/** Sends one encrypted push message; resolves with the push service's HTTP status. */
export interface PushSender {
  send(
    target: Pick<PushSubscriptionRecord, 'endpoint' | 'p256dh' | 'auth'>,
    payload: string,
    vapid: { subject: string; publicKey: string; privateKey: string },
    options: { ttl: number; urgency: 'normal' },
  ): Promise<number>;
}
