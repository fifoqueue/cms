import { can, recoveryLoginSchema } from '@cms/sdk';
import { Errors as AuthErrors } from '@cms/sdk/errors';
import type { Capability, RecoveryCodesStatus } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { requireRecentSignIn } from '#api/domain/auth/recent-sign-in';
import type {
  TokenIssuer,
  UserRepository,
  UserRecord,
  SessionRepository,
} from '#api/domain/auth/ports';
import type { SessionStarter } from '#api/domain/auth/sso-service';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import type { EmailService } from '#api/domain/email/email-service';
import { templates } from '#api/domain/email/templates';
import type { Logger } from '#api/shared/logger';
import { Errors, unauthorized } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface RecoveryCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  createdAt: Date;
}

export interface RecoveryCodeRepository {
  status(userId: string): Promise<RecoveryCodesStatus>;
  /** Replaces the entire set atomically, serializing concurrent replacements. */
  replace(userId: string, codes: RecoveryCodeRecord[]): Promise<void>;
  /** At most one concurrent caller consumes a code. */
  consume(userId: string, codeHash: string): Promise<boolean>;
}

export class RecoveryService {
  constructor(
    private readonly deps: {
      codes: RecoveryCodeRepository;
      users: UserRepository;
      roles: {
        capabilities(role: string, userId?: string): Promise<Capability[]>;
      };
      sessionRepository: Pick<SessionRepository, 'find'>;
      tokens: TokenIssuer;
      ids: IdGenerator;
      clock: Clock;
      sessions: SessionStarter;
      protection: Pick<ProtectionService, 'check'>;
      email: Pick<EmailService, 'enabled' | 'queue'>;
      site: () => Promise<{ title: string; locale: string }>;
      logger: Logger;
    },
  ) {}

  status(actor: Actor) {
    authorize(actor, 'settings.manage');
    return this.deps.codes.status(actor.id);
  }

  async generate(actor: Actor, token: string) {
    authorize(actor, 'settings.manage');
    await requireRecentSignIn(
      {
        sessions: this.deps.sessionRepository,
        tokens: this.deps.tokens,
        clock: this.deps.clock,
      },
      actor,
      token,
      AuthErrors.RecoveryRecentSignIn,
    );
    // 80 random bits from a cryptographic token digest; formatting has no entropy cost.
    const codes = Array.from({ length: 10 }, () =>
      this.deps.tokens
        .digest(this.deps.tokens.issue())
        .slice(0, 20)
        .toUpperCase(),
    );
    const createdAt = this.deps.clock.now();
    await this.deps.codes.replace(
      actor.id,
      codes.map((code) => ({
        id: this.deps.ids.next(),
        userId: actor.id,
        createdAt,
        codeHash: this.deps.tokens.digest(code),
      })),
    );
    try {
      const user = await this.deps.users.findById(actor.id);
      if (user) await this.notice(user, 10, false);
    } catch {
      this.deps.logger.warn('Recovery code notification failed', {
        userId: actor.id,
      });
    }
    return {
      codes: codes.map((code) => `${code.slice(0, 10)}-${code.slice(10)}`),
    };
  }

  async remove(actor: Actor) {
    authorize(actor, 'settings.manage');
    await this.deps.codes.replace(actor.id, []);
  }

  async recover(input: unknown, attempt: Omit<Attempt, 'action' | 'account'>) {
    const { email, code } = parseInput(recoveryLoginSchema, input);
    await this.deps.protection.check({
      ...attempt,
      action: 'login',
      account: email.toLowerCase(),
    });
    const user = await this.deps.users.findByEmail(email.toLowerCase());
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const capabilities = await this.deps.roles.capabilities(
      user?.role ?? 'subscriber',
    );
    const consumed = await this.deps.codes.consume(
      user ? user.id : dummyId,
      this.deps.tokens.digest(code.replaceAll('-', '').toUpperCase()),
    );
    const verified =
      user && consumed
        ? await this.deps.roles.capabilities(user.role, user.id)
        : capabilities;
    const allowed = can(
      { role: user?.role ?? 'subscriber', capabilities: verified },
      'settings.manage',
    );
    if (!user || !allowed || !consumed)
      throw unauthorized(Errors.InvalidCredentials);
    this.deps.logger.warn('Recovery code used', { userId: user.id });
    try {
      const { remaining } = await this.deps.codes.status(user.id);
      await this.notice(user, remaining, true);
    } catch {
      this.deps.logger.warn('Recovery code notification failed', {
        userId: user.id,
      });
    }
    return this.deps.sessions.startSession(user, null);
  }

  private async notice(user: UserRecord, remaining: number, used: boolean) {
    if (!(await this.deps.email.enabled())) return;
    const site = await this.deps.site();
    await this.deps.email.queue({
      to: user.email,
      sensitive: true,
      subjects: [user.id],
      ...templates(site.locale).recovery(site.title, remaining, used),
    });
  }
}
