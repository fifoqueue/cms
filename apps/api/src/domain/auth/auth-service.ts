import { loginSchema, setupSchema } from '@cms/sdk';
import type {
  Capability,
  SessionInfo,
  SessionGrant,
  SetupStatus,
  UserProfile,
} from '@cms/sdk';
import {
  conflict,
  notFound,
  unauthorized,
  forbidden,
  Errors,
} from '#api/shared/errors';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { requireRecentSignIn } from '#api/domain/auth/recent-sign-in';
import { parseInput } from '#api/shared/validation';
import { toProfile } from '#api/domain/users/user-mapper';
import { slugify } from '#api/domain/content/slug';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type { ApiTokenService } from '#api/domain/auth/api-tokens';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import type {
  PasswordHasher,
  SessionRepository,
  TokenIssuer,
  UserRecord,
  UserRepository,
} from '#api/domain/auth/ports';

export interface AuthServiceDeps {
  passwordLogin?: () => Promise<boolean>;
  roles?: { capabilities(role: string, userId: string): Promise<Capability[]> };
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  ids: IdGenerator;
  clock: Clock;
  sessionTtlMs: number;
  /** Rate limits and captcha for sign-in; absent during installation. */
  protection?: ProtectionService;
  /** Application passwords accepted as bearer tokens besides sessions. */
  apiTokens?: Pick<ApiTokenService, 'authenticate'>;
}

export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthServiceDeps) {}

  requireRecent(actor: Actor, token: string) {
    return requireRecentSignIn(this.deps, actor, token);
  }

  async status(): Promise<SetupStatus> {
    return { setupRequired: (await this.deps.users.count()) === 0 };
  }

  /** Creates the first user. Allowed only while no user exists. */
  async setup(input: unknown): Promise<SessionGrant> {
    const { name, email, password } = parseInput(setupSchema, input);
    if ((await this.deps.users.count()) > 0)
      throw conflict(Errors.SetupCompleted);
    const id = this.deps.ids.next();
    const user: UserRecord = {
      id,
      email: email.toLowerCase(),
      name,
      passwordHash: await this.deps.hasher.hash(password),
      // The installing user runs the site.
      role: 'administrator',
      slug: slugify(name) || `user-${id.slice(-12)}`,
      bio: '',
      locale: '',
      createdAt: this.deps.clock.now(),
    };
    await this.deps.users.insert(user);
    return this.startSession(user);
  }

  /**
   * Signs in with email and password. `client` identifies the visitor for rate limits; only
   * attempts count atomically before password work, so parallel guesses cannot bypass limits.
   */
  async login(
    input: unknown,
    client: Omit<Attempt, 'action' | 'account'> = {
      client: null,
      address: null,
      captchaToken: null,
    },
  ): Promise<SessionGrant> {
    if (this.deps.passwordLogin && !(await this.deps.passwordLogin()))
      throw forbidden(Errors.PasswordLoginDisabled);
    const { email, password } = parseInput(loginSchema, input);
    const attempt: Attempt = {
      ...client,
      action: 'login',
      account: email.toLowerCase(),
    };
    await this.deps.protection?.check(attempt);
    const user = await this.deps.users.findByEmail(email.toLowerCase());
    // Verify against a dummy hash for unknown emails so response time does not reveal accounts.
    const hash =
      user?.passwordHash ??
      (await (this.dummyHash ??= this.deps.hasher.hash('dummy-password')));
    const valid = await this.deps.hasher.verify(password, hash);
    if (!user || !valid) {
      throw unauthorized(Errors.InvalidCredentials);
    }
    return this.startSession(user);
  }

  async logout(token: string): Promise<void> {
    await this.deps.sessions.delete(this.deps.tokens.digest(token));
  }

  /** The opaque id a session is listed under: derived from its digest, never the digest itself. */
  private sessionId(tokenHash: string) {
    return this.deps.tokens.digest(`session:${tokenHash}`).slice(0, 32);
  }

  /** The signed-in user's own sessions, marking the one making this request. */
  async sessions(actor: Actor, token: string): Promise<SessionInfo[]> {
    const current = this.deps.tokens.digest(token);
    return (
      await this.deps.sessions.listForUser(actor.id, this.deps.clock.now())
    ).map((session) => ({
      id: this.sessionId(session.tokenHash),
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.tokenHash === current,
    }));
  }

  /** Signs out one of the user's own sessions; unknown ids are a 404. */
  async revokeSession(actor: Actor, id: string): Promise<void> {
    const session = (
      await this.deps.sessions.listForUser(actor.id, this.deps.clock.now())
    ).find((candidate) => this.sessionId(candidate.tokenHash) === id);
    if (!session) throw notFound(Errors.SessionNotFound);
    await this.deps.sessions.delete(session.tokenHash);
  }

  /** Signs a user out of every session (`users.manage`). API tokens are kept. */
  async signOutEverywhere(userId: string, actor: Actor): Promise<void> {
    authorize(actor, 'users.manage');
    if (!(await this.deps.users.findById(userId)))
      throw notFound(Errors.UserNotFound);
    await this.deps.sessions.deleteForUser(userId);
  }

  /** The user of a session token or, when enabled, an application password. */
  async authenticate(token: string): Promise<UserProfile | null> {
    const apiUser = await this.deps.apiTokens?.authenticate(token);
    if (apiUser) return this.profile(apiUser);
    const tokenHash = this.deps.tokens.digest(token);
    const session = await this.deps.sessions.find(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= this.deps.clock.now()) {
      await this.deps.sessions.delete(tokenHash);
      return null;
    }
    return this.profile(session.user);
  }

  private async profile(user: UserRecord): Promise<UserProfile> {
    const profile = toProfile(user);
    if (this.deps.roles)
      profile.capabilities = await this.deps.roles.capabilities(
        user.role,
        user.id,
      );
    return profile;
  }

  /**
   * Issues a session for an already authenticated user. `identityId` binds it to the linked
   * single sign-on identity it was issued through, so unlinking that identity revokes it.
   */
  async startSession(
    user: UserRecord,
    identityId: string | null = null,
  ): Promise<SessionGrant> {
    const token = this.deps.tokens.issue();
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + this.deps.sessionTtlMs);
    await this.deps.sessions.insert({
      tokenHash: this.deps.tokens.digest(token),
      userId: user.id,
      identityId,
      createdAt: now,
      expiresAt,
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: await this.profile(user),
    };
  }
}
