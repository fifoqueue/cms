import type {
  AdmissionLimits,
  ExternalIdentityRecord,
  ExternalIdentityRepository,
  SsoTransactionRecord,
  SsoTransactionRepository,
  SsoAccessTransactions,
  SsoAccessContext,
} from '#api/domain/auth/sso-ports';
import { guardUnique, lockSetting } from '#api/infra/prisma/client';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import { Errors } from '#api/shared/errors';
import type { Database } from '#api/infra/prisma/client';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

interface IdentityRow {
  id: string;
  issuer: Uint8Array;
  subject: Uint8Array;
  userId: string;
  createdAt: Date;
}

const toRecord = (row: IdentityRow): ExternalIdentityRecord => ({
  id: row.id,
  issuer: decoder.decode(row.issuer),
  subject: decoder.decode(row.subject),
  userId: row.userId,
  createdAt: row.createdAt,
});

export class PrismaSsoAccessTransactions implements SsoAccessTransactions {
  constructor(private readonly db: Database) {}
  run<T>(work: (context: SsoAccessContext) => Promise<T>) {
    return this.db.$transaction(async (tx) => {
      await lockSetting(tx, 'signIn.admission');
      return work({
        settings: new PrismaSettingsRepository(tx),
        identities: {
          findByUser: async (userId) =>
            (await tx.userIdentity.findMany({ where: { userId } })).map(
              toRecord,
            ),
          unlink: async (userId, id) => {
            await tx.userIdentity.deleteMany({ where: { userId, id } });
          },
        },
      });
    });
  }
}

/**
 * Issuer and subject live in VARBINARY columns as UTF-8 bytes, so lookups and the unique index
 * compare bytes: no collation folds case, normalizes or ignores trailing spaces.
 * Sessions reference identities with `ON DELETE CASCADE`, so deleting one revokes its sessions
 * in the same statement.
 */
export class PrismaIdentityRepository implements ExternalIdentityRepository {
  constructor(
    private readonly db: Pick<
      Database,
      'userIdentity' | 'passwordToken' | '$transaction'
    >,
  ) {}

  async find(issuer: string, subject: string) {
    const row = await this.db.userIdentity.findUnique({
      where: {
        issuer_subject: {
          issuer: encoder.encode(issuer),
          subject: encoder.encode(subject),
        },
      },
    });

    return row && toRecord(row);
  }

  async findByUser(userId: string) {
    return (await this.db.userIdentity.findMany({ where: { userId } })).map(
      toRecord,
    );
  }

  async claimUser(tokenHash: string, now: Date) {
    const token = await this.db.passwordToken.findFirst({
      where: { tokenHash, expiresAt: { gt: now } },
    });
    return token?.userId ?? null;
  }

  async claim(identity: ExternalIdentityRecord, tokenHash: string, now: Date) {
    return guardUnique(
      () =>
        this.db.$transaction(async (tx) => {
          await lockSetting(tx, 'sso.claim');
          if (
            await tx.userIdentity.findFirst({
              where: {
                userId: identity.userId,
                issuer: encoder.encode(identity.issuer),
              },
            })
          )
            return false;
          const consumed = await tx.passwordToken.deleteMany({
            where: {
              tokenHash,
              userId: identity.userId,
              expiresAt: { gt: now },
            },
          });
          if (!consumed.count) return false;
          await tx.passwordToken.deleteMany({
            where: { userId: identity.userId },
          });
          await tx.userIdentity.create({
            data: {
              ...identity,
              issuer: encoder.encode(identity.issuer),
              subject: encoder.encode(identity.subject),
            },
          });
          return true;
        }),
      Errors.SsoAccountLinkedElsewhere,
    );
  }

  async link(identity: ExternalIdentityRecord) {
    await guardUnique(
      () =>
        this.db.$transaction([
          this.db.userIdentity.deleteMany({
            where: {
              userId: identity.userId,
              issuer: encoder.encode(identity.issuer),
            },
          }),
          this.db.userIdentity.create({
            data: {
              ...identity,
              issuer: encoder.encode(identity.issuer),
              subject: encoder.encode(identity.subject),
            },
          }),
        ]),
      Errors.SsoAccountLinkedElsewhere,
    );
  }

  async unlink(userId: string, identityId: string) {
    await this.db.userIdentity.deleteMany({
      where: { userId, id: identityId },
    });
  }
}

/** Settings row whose lock serializes admissions across processes until the transaction commits. */
const ADMISSION_LOCK = 'sso.admission';

export class PrismaSsoTransactionRepository implements SsoTransactionRepository {
  constructor(
    private readonly db: Pick<Database, 'ssoTransaction' | '$transaction'>,
  ) {}

  admit(
    transaction: SsoTransactionRecord,
    now: Date,
    { total, perClient }: AdmissionLimits,
  ) {
    return this.db.$transaction(async (tx) => {
      // An atomic upsert, so even the very first concurrent admissions queue on the same row lock.
      // It is the transaction's first statement: the counts below read after the lock is held.
      await tx.$executeRaw`INSERT INTO settings (\`key\`, value) VALUES (${ADMISSION_LOCK}, 'true') ON DUPLICATE KEY UPDATE value = 'true'`;
      await tx.ssoTransaction.deleteMany({
        where: { expiresAt: { lte: now } },
      });

      if ((await tx.ssoTransaction.count()) >= total) return false;

      const fromClient = await tx.ssoTransaction.count({
        where: { clientKey: transaction.clientKey },
      });

      if (fromClient >= perClient) return false;

      await tx.ssoTransaction.create({ data: transaction });

      return true;
    });
  }

  async take(handleHash: string) {
    const row = await this.db.ssoTransaction.findUnique({
      where: { handleHash },
    });
    if (!row) return null;

    // Only the request that actually deletes the row may use it.
    const { count } = await this.db.ssoTransaction.deleteMany({
      where: { handleHash },
    });

    return count === 1 ? row : null;
  }
}
