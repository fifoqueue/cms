import {
  passwordChangeSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import type {
  PasswordHasher,
  PasswordTokenPurpose,
  PasswordTokenRepository,
  TokenIssuer,
  UserRecord,
  UserRepository,
} from '#api/domain/auth/ports';
import type { EmailService } from '#api/domain/email/email-service';
import { templates } from '#api/domain/email/templates';
import type { Clock } from '#api/domain/ports';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import { invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const HOUR = 60 * 60 * 1000;
const LIFETIME: Record<PasswordTokenPurpose, number> = {
  reset: HOUR,
  invite: 7 * 24 * HOUR,
};

export interface PasswordServiceDeps {
  users: UserRepository;
  tokens: PasswordTokenRepository;
  credentials: CredentialRepository;
  issuer: TokenIssuer;
  hasher: PasswordHasher;
  email: EmailService;
  protection: ProtectionService;
  clock: Clock;
  /** Public origin and display settings used in links and mail copy. */
  site: () => Promise<{ siteUrl: string; title: string; locale: string }>;
}

/** Atomically changes credentials and revokes every other way into the account. */
export interface CredentialRepository {
  change(
    userId: string,
    passwordHash: string,
    keepSessionHash: string | null,
  ): Promise<void>;
  validReset(tokenHash: string, now: Date): Promise<boolean>;
  reset(tokenHash: string, now: Date, passwordHash: string): Promise<boolean>;
}

/** The address of the page where a link holder chooses a password. */
const passwordPage = (siteUrl: string, token: string) =>
  `${siteUrl}/admin/password?token=${encodeURIComponent(token)}`;

/** Password changes, resets by email, and invitations. */
export class PasswordService {
  constructor(private readonly deps: PasswordServiceDeps) {}

  /** Changes the signed-in user's password and signs out their other sessions. */
  async change(input: unknown, actor: Actor, sessionToken: string) {
    const { current, password } = parseInput(passwordChangeSchema, input);
    const user = await this.deps.users.findById(actor.id);
    if (!user) throw notFound(Errors.UserNotFound);
    if (!(await this.deps.hasher.verify(current, user.passwordHash)))
      throw invalidInput(Errors.CurrentPasswordWrong, [
        { path: 'current', message: Errors.CurrentPasswordWrong },
      ]);
    await this.deps.credentials.change(
      user.id,
      await this.deps.hasher.hash(password),
      this.deps.issuer.digest(sessionToken),
    );
  }

  /**
   * Emails a reset link when the address belongs to a user. Answers the same either way, so
   * the response never reveals which addresses have accounts.
   */
  async requestReset(
    input: unknown,
    attempt: Omit<Attempt, 'action' | 'account'>,
  ) {
    const { email } = parseInput(passwordResetRequestSchema, input);
    const account = email.toLowerCase();
    const protectedAttempt = {
      ...attempt,
      action: 'passwordReset' as const,
      account,
    };
    await this.deps.protection.check(protectedAttempt);
    if (!(await this.deps.email.enabled()))
      throw invalidInput(Errors.EmailDisabled);
    const site = await this.site();
    const user = await this.deps.users.findByEmail(account);
    if (!user) return;
    const link = await this.link(user, 'reset', site.siteUrl);
    await this.deps.email.queue({
      to: user.email,
      ...templates(site.locale).reset(site.title, link),
    });
  }

  /** Emails a new user the link to choose their first password. */
  async invite(user: UserRecord) {
    const site = await this.site();
    const link = await this.link(user, 'invite', site.siteUrl);
    await this.deps.email.queue({
      to: user.email,
      ...templates(site.locale).invite(site.title, user.name, link),
    });
  }

  /** Sets the password from a reset or invitation link and signs the user out everywhere. */
  async reset(input: unknown) {
    const { token, password } = parseInput(passwordResetSchema, input);
    const tokenHash = this.deps.issuer.digest(token);
    const now = this.deps.clock.now();
    if (!(await this.deps.credentials.validReset(tokenHash, now)))
      throw invalidInput(Errors.PasswordTokenInvalid);
    const changed = await this.deps.credentials.reset(
      tokenHash,
      now,
      await this.deps.hasher.hash(password),
    );
    if (!changed) throw invalidInput(Errors.PasswordTokenInvalid);
  }

  private async link(
    user: UserRecord,
    purpose: PasswordTokenPurpose,
    siteUrl: string,
  ) {
    const token = this.deps.issuer.issue();
    await this.deps.tokens.insert({
      tokenHash: this.deps.issuer.digest(token),
      userId: user.id,
      purpose,
      expiresAt: new Date(this.deps.clock.now().getTime() + LIFETIME[purpose]),
    });
    return passwordPage(siteUrl, token);
  }

  private async site() {
    const site = await this.deps.site();
    if (!site.siteUrl) throw invalidInput(Errors.SiteUrlRequired);
    return site;
  }
}
