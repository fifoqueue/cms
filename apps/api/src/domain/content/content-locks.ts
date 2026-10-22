import { contentUnlockSchema } from '@cms/sdk';
import type { ContentUnlocked } from '@cms/sdk';
import type { PasswordHasher } from '#api/domain/auth/ports';
import type { PublishedContentRepository } from '#api/domain/content/published-content-repository';
import type { Clock, Signer } from '#api/domain/ports';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import { invalidInput, notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/** How long an entered password keeps an entry unlocked (WordPress: ten days). */
const LIFETIME_MS = 10 * 24 * 60 * 60 * 1000;

/** At most this many proofs are examined per request. */
const MAX_PROOFS = 20;

/**
 * Password-protected entries. A visitor who enters the password receives a signed proof bound
 * to the entry and its current password, so changing the password locks everyone out again.
 */
export class ContentLocks {
  constructor(
    private readonly deps: {
      repository: Pick<PublishedContentRepository, 'passwordHash'>;
      hasher: PasswordHasher;
      signer: Signer;
      clock: Clock;
      protection?: Pick<ProtectionService, 'check'>;
    },
  ) {}

  async unlock(
    id: string,
    input: unknown,
    attempt: Omit<Attempt, 'action' | 'account'> = {
      client: null,
      address: null,
      captchaToken: null,
    },
  ): Promise<ContentUnlocked> {
    const { password } = parseInput(contentUnlockSchema, input);
    await this.deps.protection?.check({
      ...attempt,
      action: 'contentUnlock',
      account: id,
    });
    const hash = await this.deps.repository.passwordHash(id);
    if (!hash) throw notFound(Errors.ContentNotFound);
    if (!(await this.deps.hasher.verify(password, hash)))
      throw invalidInput(Errors.ContentPasswordWrong, [
        { path: 'password', message: Errors.ContentPasswordWrong },
      ]);
    const expires = this.deps.clock.now().getTime() + LIFETIME_MS;
    return {
      token: `${expires}.${this.deps.signer.sign(`${id}:${expires}:${hash}`)}`,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  /** Whether `proofs` (`<id>.<token>`) unlock entry `id`. Reads nothing without a proof for it. */
  async unlocked(id: string, proofs: readonly string[]): Promise<boolean> {
    const tokens = proofs
      .slice(0, MAX_PROOFS)
      .filter((proof) => proof.startsWith(`${id}.`))
      .map((proof) => proof.slice(id.length + 1));
    if (!tokens.length) return false;
    const hash = await this.deps.repository.passwordHash(id);
    if (!hash) return false;
    const now = this.deps.clock.now().getTime();
    return tokens.some((token) => {
      const [expires, signature] = token.split('.');
      return (
        !!signature &&
        Number(expires) > now &&
        this.deps.signer.verify(`${id}:${expires}:${hash}`, signature)
      );
    });
  }
}
