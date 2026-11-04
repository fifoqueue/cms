import {
  passwordChangeSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  adminUserSchema,
} from '@cms/sdk';
import { z } from 'zod';
import type { RateRule } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { RateLimitStore } from '#api/domain/security/ports';
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
import type { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import type { Clock, HookDispatcher } from '#api/domain/ports';
import { toProfile } from '#api/domain/users/user-mapper';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import {
  invalidInput,
  notFound,
  rateLimited,
  Errors,
  forbidden,
} from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const HOUR = 60 * 60 * 1000;
export const PASSWORD_RESET_REQUEST_JOB = 'password.reset.request';
const resetRequestSchema = z.strictObject({
  email: z.email(),
  subjects: z.array(z.string().max(191)).max(100).optional(),
});

/** Reset emails one administrator may send per hour. */
const ADMIN_RESET_RULE: RateRule = {
  enabled: true,
  max: 20,
  windowSeconds: 3600,
  blockSeconds: 0,
  enforcement: 'block',
};
const LIFETIME: Record<PasswordTokenPurpose, number> = {
  reset: HOUR,
  invite: 7 * 24 * HOUR,
};

export interface PasswordServiceDeps {
  hooks?: HookDispatcher;
  passwordLogin?: () => Promise<boolean>;
  users: UserRepository;
  tokens: PasswordTokenRepository;
  credentials: CredentialRepository;
  issuer: TokenIssuer;
  hasher: PasswordHasher;
  email: EmailService;
  sealedJobs: SealedJobs;
  protection: ProtectionService;
  /** Counts the reset emails each administrator sends (`sendReset`). */
  limits: RateLimitStore;
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
  /** The valid token's user id; null for expired or consumed tokens. */
  validReset(tokenHash: string, now: Date): Promise<string | null>;
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
    if (this.deps.hooks?.has('user.passwordChanged'))
      await this.deps.hooks.emit('user.passwordChanged', {
        user: toProfile(user),
      });
  }

  /**
   * Emails a reset link when the address belongs to a user. Answers the same either way, so
   * the response never reveals which addresses have accounts.
   */
  async requestReset(
    input: unknown,
    attempt: Omit<Attempt, 'action' | 'account'>,
  ) {
    if (!this.deps.hooks?.has('user.passwordResetAllowed'))
      await this.allowPassword();
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
    await this.deps.sealedJobs.enqueue(
      PASSWORD_RESET_REQUEST_JOB,
      {
        email: account,
        subjects: [account],
      },
      new Date(this.deps.clock.now().getTime() + LIFETIME.reset),
    );
  }

  /** Background account lookup keeps the public response independent of existence. */
  async deliverResetRequest(payload: unknown) {
    const { email } = this.deps.sealedJobs.open(payload, resetRequestSchema);
    const user = await this.deps.users.findByEmail(email);
    if (!user) return;
    await this.queueReset(
      user,
      [user.id, user.email],
      await this.passwordLogin(),
    );
  }

  /**
   * Emails a reset link for an administrator (`users.manage`), limited to 20 per hour.
   * Visitor limits and captcha do not apply.
   */
  async sendReset(userId: string, actor: Actor) {
    authorize(actor, 'users.manage');
    const user = await this.deps.users.findById(userId);
    if (!user) throw notFound(Errors.UserNotFound);
    if (!(await this.deps.email.enabled()))
      throw invalidInput(Errors.EmailDisabled);
    if (
      await this.deps.limits.hit(
        `adminPasswordReset:${actor.id}`,
        ADMIN_RESET_RULE,
        this.deps.clock.now(),
      )
    )
      throw rateLimited(Errors.PasswordResetLimit);
    await this.queueReset(user, [user.id]);
  }

  private async queueReset(
    user: UserRecord,
    subjects: string[],
    allowed = true,
  ) {
    if (this.deps.hooks?.has('user.passwordResetRequested'))
      await this.deps.hooks.emit('user.passwordResetRequested', {
        user: toProfile(user),
      });
    if (!(await this.resetAllowed(user, allowed))) return;
    const site = await this.site();
    const link = await this.link(user, 'reset', site.siteUrl);
    await this.deps.email.queue(
      {
        to: user.email,
        subjects,
        sensitive: true,
        ...templates(site.locale).reset(
          site.title,
          link,
          !(await this.passwordLogin()),
        ),
      },
      new Date(this.deps.clock.now().getTime() + LIFETIME.reset),
    );
  }

  /** Emails a new user the link to choose their first password. */
  async invite(user: UserRecord) {
    const site = await this.site();
    const link = await this.link(user, 'invite', site.siteUrl);
    await this.deps.email.queue(
      {
        to: user.email,
        subjects: [user.id],
        sensitive: true,
        ...templates(site.locale).invite(
          site.title,
          user.name,
          link,
          !(await this.passwordLogin()),
        ),
      },
      new Date(this.deps.clock.now().getTime() + LIFETIME.invite),
    );
  }

  /** Sets the password from a reset or invitation link and signs the user out everywhere. */
  async reset(input: unknown) {
    const { token, password } = parseInput(passwordResetSchema, input);

    if (
      !(await this.commitReset(
        this.deps.issuer.digest(token),
        this.deps.clock.now(),
        password,
      ))
    )
      throw invalidInput(Errors.PasswordTokenInvalid);
  }

  /** Applies reset policy, consumes one proof, and emits an event after commit. */
  async commitReset(
    tokenHash: string,
    now: Date,
    password: string,
    expectedUserId?: string,
  ): Promise<boolean> {
    const filter = this.deps.hooks?.has('user.passwordResetAllowed');

    if (!filter) await this.allowPassword();

    const userId = await this.deps.credentials.validReset(tokenHash, now);

    if (!userId || (expectedUserId && userId !== expectedUserId)) return false;

    const user =
      filter || this.deps.hooks?.has('user.passwordReset')
        ? await this.deps.users.findById(userId)
        : null;

    if (
      filter &&
      (!user || !(await this.resetAllowed(user, await this.passwordLogin())))
    )
      throw forbidden(Errors.PasswordLoginDisabled);

    const changed = await this.deps.credentials.reset(
      tokenHash,
      now,
      await this.deps.hasher.hash(password),
    );

    if (!changed) return false;

    if (user && this.deps.hooks?.has('user.passwordReset'))
      await this.deps.hooks.emit('user.passwordReset', {
        user: toProfile(user),
      });

    return true;
  }

  private async resetAllowed(user: UserRecord, allowed: boolean) {
    if (!this.deps.hooks?.has('user.passwordResetAllowed')) return allowed;
    const profile = adminUserSchema.strict().parse(toProfile(user));
    const snapshot = JSON.stringify(profile);
    const schema = z.strictObject({
      user: adminUserSchema
        .strict()
        .refine((value) => JSON.stringify(value) === snapshot),
      allowed: z.boolean(),
    });
    return (
      await this.deps.hooks.applyFilter(
        'user.passwordResetAllowed',
        { user: profile, allowed },
        (value) => schema.safeParse(value).success,
      )
    ).allowed;
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

  private passwordLogin() {
    return this.deps.passwordLogin?.() ?? Promise.resolve(true);
  }
  private async allowPassword() {
    if (!(await this.passwordLogin()))
      throw forbidden(Errors.PasswordLoginDisabled);
  }
}
