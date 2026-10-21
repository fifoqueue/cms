import { loginSchema, setupSchema } from '@cms/sdk';
import type { SessionGrant, SetupStatus, UserProfile } from '@cms/sdk';
import { conflict, unauthorized } from '../../shared/errors';
import { parseInput } from '../../shared/validation';
import type { Clock, IdGenerator } from '../ports';
import type {
  PasswordHasher,
  SessionRepository,
  TokenIssuer,
  UserRecord,
  UserRepository,
} from './ports';

export interface AuthServiceDeps {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  tokens: TokenIssuer;
  ids: IdGenerator;
  clock: Clock;
  sessionTtlMs: number;
}

const toProfile = ({ id, email, name }: UserRecord): UserProfile => ({
  id,
  email,
  name,
});

export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthServiceDeps) {}

  async status(): Promise<SetupStatus> {
    return { setupRequired: (await this.deps.users.count()) === 0 };
  }

  /** Creates the first user. Allowed only while no user exists. */
  async setup(input: unknown): Promise<SessionGrant> {
    const { name, email, password } = parseInput(setupSchema, input);
    if ((await this.deps.users.count()) > 0)
      throw conflict('Setup has already been completed');
    const user: UserRecord = {
      id: this.deps.ids.next(),
      email: email.toLowerCase(),
      name,
      passwordHash: await this.deps.hasher.hash(password),
      createdAt: this.deps.clock.now(),
    };
    await this.deps.users.insert(user);
    return this.startSession(user);
  }

  async login(input: unknown): Promise<SessionGrant> {
    const { email, password } = parseInput(loginSchema, input);
    const user = await this.deps.users.findByEmail(email.toLowerCase());
    // Verify against a dummy hash for unknown emails so response time does not reveal accounts.
    const hash =
      user?.passwordHash ??
      (await (this.dummyHash ??= this.deps.hasher.hash('dummy-password')));
    const valid = await this.deps.hasher.verify(password, hash);
    if (!user || !valid) throw unauthorized('Invalid email or password');
    return this.startSession(user);
  }

  async logout(token: string): Promise<void> {
    await this.deps.sessions.delete(this.deps.tokens.digest(token));
  }

  async authenticate(token: string): Promise<UserProfile | null> {
    const tokenHash = this.deps.tokens.digest(token);
    const session = await this.deps.sessions.find(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= this.deps.clock.now()) {
      await this.deps.sessions.delete(tokenHash);
      return null;
    }
    const user = await this.deps.users.findById(session.userId);
    return user ? toProfile(user) : null;
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
    const expiresAt = new Date(
      this.deps.clock.now().getTime() + this.deps.sessionTtlMs,
    );
    await this.deps.sessions.insert({
      tokenHash: this.deps.tokens.digest(token),
      userId: user.id,
      identityId,
      expiresAt,
    });
    return { token, expiresAt: expiresAt.toISOString(), user: toProfile(user) };
  }
}
