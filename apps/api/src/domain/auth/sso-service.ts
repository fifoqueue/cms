import { ssoCallbackSchema, ssoStartSchema } from '@cms/sdk';
import type {
  SessionGrant,
  SsoCallbackResult,
  SsoIdentityStatus,
  SsoInfo,
  SsoStart,
  UserProfile,
} from '@cms/sdk';
import {
  conflict,
  notFound,
  rateLimited,
  unauthorized,
  Errors,
} from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { Clock, IdGenerator, RateLimiter } from '#api/domain/ports';
import type {
  TokenIssuer,
  UserRecord,
  UserRepository,
} from '#api/domain/auth/ports';
import { IDENTITY_MAX_BYTES } from '#api/domain/auth/sso-ports';
import type {
  AdmissionLimits,
  ExternalIdentityRepository,
  OidcProvider,
  SsoTransactionRepository,
  VerifiedIdentity,
} from '#api/domain/auth/sso-ports';

export interface SessionStarter {
  /** `identityId` binds the session to a linked identity (see `SessionRepository.insert`). */
  startSession(
    user: UserRecord,
    identityId: string | null,
  ): Promise<SessionGrant>;
}

const encoder = new TextEncoder();

/** Only well-formed strings encode to UTF-8 one-to-one, so only those are stored as bytes. */
const storable = (value: string) =>
  value.length > 0 &&
  value.isWellFormed() &&
  encoder.encode(value).length <= IDENTITY_MAX_BYTES;

/** The current single sign-on configuration (admin settings, or the environment). */
export interface SsoSetup {
  /** `null` when single sign-on is not configured. */
  provider: OidcProvider | null;
  name: string;
  /** Operator allowlist: provider subject → email of an existing local user. */
  subjects: ReadonlyMap<string, string>;
}

export interface SsoServiceDeps {
  setup: () => Promise<SsoSetup>;
  users: UserRepository;
  identities: ExternalIdentityRepository;
  transactions: SsoTransactionRepository;
  sessions: SessionStarter;
  tokens: TokenIssuer;
  ids: IdGenerator;
  clock: Clock;
  transactionTtlMs: number;
  /** Bounds on pending sign-in requests, which anyone can start. */
  admission: AdmissionLimits;
  /** Rate of sign-in starts per client and overall, checked before any other work. */
  startLimiter: RateLimiter;
}

interface SignInTarget {
  user: UserRecord;
  /** The linked identity used; `null` for operator-assigned subjects. */
  identityId: string | null;
}

/**
 * Single sign-on never creates users and never matches accounts by email claims.
 * A provider identity signs in only when it is linked explicitly by its signed-in owner
 * or assigned to an existing user in the operator's subject allowlist.
 */
export class SsoService {
  constructor(private readonly deps: SsoServiceDeps) {}

  async info(): Promise<SsoInfo> {
    const { provider, name } = await this.deps.setup();
    return provider ? { enabled: true, name } : { enabled: false, name: null };
  }

  /**
   * `user` is the signed-in user, required for the `link` intent. `client` is the opaque,
   * trustworthy identity of the requesting client established by the HTTP boundary; link
   * requests are counted per user instead.
   */
  async start(
    input: unknown,
    user: UserProfile | null,
    client: string,
  ): Promise<SsoStart> {
    const { provider } = await this.enabled();
    const { intent } = parseInput(ssoStartSchema, input);

    if (intent === 'link' && !user) throw unauthorized();

    const linkUserId = intent === 'link' ? user!.id : null;
    const clientKey = linkUserId ? `user:${linkUserId}` : `client:${client}`;

    // Refused before any provider or database work, so a flood costs nothing downstream.
    if (!this.deps.startLimiter.tryAcquire(clientKey))
      throw rateLimited(Errors.SsoRateLimited);

    const request = await provider.authorize();
    const transaction = this.deps.tokens.issue();
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + this.deps.transactionTtlMs);

    const admitted = await this.deps.transactions.admit(
      {
        handleHash: this.deps.tokens.digest(transaction),
        state: request.state,
        nonce: request.nonce,
        codeVerifier: request.codeVerifier,
        userId: linkUserId,
        clientKey: this.deps.tokens.digest(clientKey),
        expiresAt,
      },
      now,
      this.deps.admission,
    );

    if (!admitted) throw conflict(Errors.SsoPendingLimit);

    return {
      authorizationUrl: request.url,
      transaction,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** `user` is the signed-in user; a link completes only for the user who started it. */
  async complete(
    input: unknown,
    user: UserProfile | null,
  ): Promise<SsoCallbackResult> {
    const { provider, subjects } = await this.enabled();
    const { transaction, query } = parseInput(ssoCallbackSchema, input);

    const pending = await this.deps.transactions.take(
      this.deps.tokens.digest(transaction),
    );
    const now = this.deps.clock.now();

    if (!pending || pending.expiresAt <= now)
      throw unauthorized(Errors.SsoRequestExpired);

    if (pending.userId && user?.id !== pending.userId)
      throw unauthorized(Errors.SsoLinkSignInRequired);

    const identity = await provider.verify(query, pending);

    if (!storable(identity.issuer) || !storable(identity.subject))
      throw unauthorized(Errors.SsoAccountUnusable);

    if (pending.userId) {
      if (subjects.has(identity.subject))
        throw conflict(Errors.SsoAccountAssigned);

      await this.deps.identities.link({
        id: this.deps.ids.next(),
        issuer: identity.issuer,
        subject: identity.subject,
        userId: pending.userId,
        createdAt: now,
      });

      return { kind: 'linked' };
    }

    const target = await this.resolve(identity, subjects);

    if (!target) throw unauthorized(Errors.SsoAccountNotLinked);

    // Bound to the identity: if an unlink wins the race, the session is refused or removed.
    return {
      kind: 'session',
      session: await this.deps.sessions.startSession(
        target.user,
        target.identityId,
      ),
    };
  }

  async identity(user: UserProfile): Promise<SsoIdentityStatus> {
    const linked = await this.deps.identities.findByUser(user.id);
    const email = user.email.toLowerCase();

    return {
      identity: linked && {
        issuer: linked.issuer,
        subject: linked.subject,
        linkedAt: linked.createdAt.toISOString(),
      },
      assigned: [...(await this.deps.setup()).subjects.values()].includes(
        email,
      ),
    };
  }

  async unlink(userId: string): Promise<void> {
    await this.deps.identities.unlink(userId);
  }

  /**
   * The operator allowlist takes precedence over links made in the admin area. Stored values
   * must equal the verified ones exactly, whatever comparison rules the store applies.
   */
  private async resolve(
    { issuer, subject }: VerifiedIdentity,
    subjects: ReadonlyMap<string, string>,
  ): Promise<SignInTarget | null> {
    const email = subjects.get(subject);

    if (email) {
      const user = await this.deps.users.findByEmail(email);
      return user?.email === email ? { user, identityId: null } : null;
    }

    const linked = await this.deps.identities.find(issuer, subject);

    if (!linked || linked.issuer !== issuer || linked.subject !== subject)
      return null;

    const user = await this.deps.users.findById(linked.userId);
    return user && { user, identityId: linked.id };
  }

  private async enabled() {
    const setup = await this.deps.setup();
    if (!setup.provider) throw notFound(Errors.SsoNotFound);
    return { ...setup, provider: setup.provider };
  }
}
