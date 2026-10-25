import { createHash } from 'node:crypto';
import { sameAuth } from '#api/infra/push-auth';
import type {
  PushInvalidReason,
  PushKeys,
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '#api/domain/comments/notification-ports';
import type { Database } from '#api/infra/prisma/client';
import { lockSetting } from '#api/infra/prisma/client';
import type { Prisma } from '#api/infra/prisma/generated/client';

const LOCK = 'push.subscriptions';

/** Exact (binary) endpoint identity; the column collation would compare case-insensitively. */
export const endpointHash = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex');

const columns = {
  id: true,
  commentId: true,
  userId: true,
  endpoint: true,
  p256dh: true,
  auth: true,
  expiresAt: true,
  status: true,
  invalidReason: true,
  invalidatedAt: true,
  lastSeenAt: true,
  createdAt: true,
} as const satisfies Prisma.PushSubscriptionSelect;

type Row = Prisma.PushSubscriptionGetPayload<{ select: typeof columns }>;

const toRecord = (row: Row): PushSubscriptionRecord => ({
  ...row,
  status: row.status === 'active' ? 'active' : 'invalid',
  invalidReason: row.invalidReason as PushInvalidReason | null,
});

const refreshed = (keys: PushKeys, at: Date) => ({
  endpoint: keys.endpoint,
  endpointHash: endpointHash(keys.endpoint),
  p256dh: keys.p256dh,
  auth: keys.auth,
  expiresAt: keys.expiresAt,
  status: 'active',
  invalidReason: null,
  invalidatedAt: null,
  lastSeenAt: at,
});

export class PrismaPushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: Database) {}

  async save(record: PushSubscriptionRecord, cap: number) {
    const owner = record.commentId
      ? { commentId: record.commentId }
      : { userId: record.userId };
    await this.db.$transaction(async (tx) => {
      await lockSetting(tx, LOCK);
      const existing = await tx.pushSubscription.findFirst({
        where: { ...owner, endpointHash: endpointHash(record.endpoint) },
        select: { id: true },
      });
      const data = refreshed(record, record.lastSeenAt);
      if (existing)
        await tx.pushSubscription.update({ where: { id: existing.id }, data });
      else
        await tx.pushSubscription.create({
          data: {
            ...data,
            id: record.id,
            commentId: record.commentId,
            userId: record.userId,
            createdAt: record.createdAt,
          },
        });
      const surplus = await tx.pushSubscription.findMany({
        where: owner,
        orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
        skip: cap,
        select: { id: true },
      });
      if (surplus.length)
        await tx.pushSubscription.deleteMany({
          where: { id: { in: surplus.map((row) => row.id) } },
        });
    });
  }

  async findById(id: string) {
    const row = await this.db.pushSubscription.findUnique({
      where: { id },
      select: columns,
    });
    return row ? toRecord(row) : null;
  }

  async active(owner: { commentId?: string | null; userId?: string | null }) {
    const or = [
      ...(owner.commentId ? [{ commentId: owner.commentId }] : []),
      ...(owner.userId ? [{ userId: owner.userId }] : []),
    ];
    if (!or.length) return [];
    const rows = await this.db.pushSubscription.findMany({
      where: { status: 'active', OR: or },
      select: columns,
      orderBy: { id: 'asc' },
    });
    return rows.map(toRecord);
  }

  async renew(
    old: { endpoint: string; auth: string },
    next: PushKeys,
    at: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, LOCK);
      const candidates = await tx.pushSubscription.findMany({
        where: { endpointHash: endpointHash(old.endpoint), status: 'active' },
        select: { id: true, commentId: true, userId: true, auth: true },
      });
      // Every candidate is compared, so the time taken does not reveal which secret matched.
      const rows = candidates.filter((row) => sameAuth(row.auth, old.auth));
      const data = refreshed(next, at);
      for (const row of rows) {
        const duplicate =
          next.endpoint === old.endpoint
            ? null
            : await tx.pushSubscription.findFirst({
                where: {
                  endpointHash: data.endpointHash,
                  ...(row.commentId
                    ? { commentId: row.commentId }
                    : { userId: row.userId }),
                },
                select: { id: true },
              });
        if (duplicate) {
          await tx.pushSubscription.delete({ where: { id: row.id } });
          await tx.pushSubscription.update({
            where: { id: duplicate.id },
            data,
          });
        } else
          await tx.pushSubscription.update({ where: { id: row.id }, data });
      }
      return rows.length;
    });
  }

  async removeForUser(userId: string, endpoint: string) {
    await this.db.pushSubscription.deleteMany({
      where: { userId, endpointHash: endpointHash(endpoint) },
    });
  }

  async delete(id: string) {
    await this.db.pushSubscription.deleteMany({ where: { id } });
  }

  async invalidate(
    ids: readonly string[],
    reason: PushInvalidReason,
    at: Date,
  ) {
    if (!ids.length) return;
    await this.db.pushSubscription.updateMany({
      where: { id: { in: [...ids] }, status: 'active' },
      data: { status: 'invalid', invalidReason: reason, invalidatedAt: at },
    });
  }

  async page(afterId: string | null, limit: number) {
    const rows = await this.db.pushSubscription.findMany({
      where: { status: 'active', ...(afterId && { id: { gt: afterId } }) },
      select: columns,
      orderBy: { id: 'asc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async purge(before: Date) {
    const { count } = await this.db.pushSubscription.deleteMany({
      where: { status: 'invalid', invalidatedAt: { lt: before } },
    });
    return count;
  }
}
