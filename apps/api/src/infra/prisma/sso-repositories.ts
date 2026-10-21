import type {
  AdmissionLimits,
  ExternalIdentityRecord,
  ExternalIdentityRepository,
  SsoTransactionRecord,
  SsoTransactionRepository,
} from '../../domain/auth/sso-ports';
import { guardUnique } from './client';
import type { Database } from './client';

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

/**
 * Issuer and subject live in VARBINARY columns as UTF-8 bytes, so lookups and the unique index
 * compare bytes: no collation folds case, normalizes or ignores trailing spaces.
 * Sessions reference identities with `ON DELETE CASCADE`, so deleting one revokes its sessions
 * in the same statement.
 */
export class PrismaIdentityRepository implements ExternalIdentityRepository {
  constructor(
    private readonly db: Pick<Database, 'userIdentity' | '$transaction'>,
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
    const row = await this.db.userIdentity.findUnique({ where: { userId } });

    return row && toRecord(row);
  }

  async link(identity: ExternalIdentityRecord) {
    await guardUnique(
      () =>
        this.db.$transaction([
          this.db.userIdentity.deleteMany({
            where: { userId: identity.userId },
          }),
          this.db.userIdentity.create({
            data: {
              ...identity,
              issuer: encoder.encode(identity.issuer),
              subject: encoder.encode(identity.subject),
            },
          }),
        ]),
      'This single sign-on account is already linked to another administrator.',
    );
  }

  async unlink(userId: string) {
    await this.db.userIdentity.deleteMany({ where: { userId } });
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
