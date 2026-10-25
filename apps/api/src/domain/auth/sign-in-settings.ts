import { z } from 'zod';
import {
  adminSignInSettingsSchema,
  DEFAULT_SIGN_IN_SETTINGS,
  signInSettingsSchema,
} from '@cms/sdk';
import type {
  AdminSignInSettings,
  SignInSettings,
  UserProfile,
} from '@cms/sdk';
import type { SignInMethodDefinition } from '@cms/sdk/plugin';
import { Errors as SignInErrors } from '@cms/sdk/errors';
import { authorize } from '#api/domain/auth/authorization';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import type { Logger } from '#api/shared/logger';
import { invalidInput } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface SignInCatalog {
  available(): Promise<AdminSignInSettings['available']>;
  method(id: string): SignInMethodDefinition | undefined;
  factor(id: string): { enroll?: unknown } | undefined;
}

const legacySchema = z.object({
  settings: z.object({ passwordLogin: z.boolean() }),
});

/** Preserve old SSO-only installations before an SSO save drops the obsolete field. */
export const migrateSignInPolicy = async (store: SettingsRepository) => {
  if ((await store.get('signIn')) != null) return;
  const legacy = legacySchema.safeParse(await store.get('sso'));
  await store.set(
    'signIn',
    signInSettingsSchema.parse({
      ...DEFAULT_SIGN_IN_SETTINGS,
      ...(legacy.success && !legacy.data.settings.passwordLogin
        ? { methods: ['sso'] }
        : {}),
    }),
  );
};

export class SignInSettingsService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      transactions: SettingsTransactions;
      registry: SignInCatalog;
      passwordForced: boolean;
      logger: Logger;
    },
  ) {}

  private async stored(store = this.deps.settings): Promise<SignInSettings> {
    const raw = await store.get('signIn');
    if (raw !== undefined && raw !== null)
      return parseInput(signInSettingsSchema, raw);
    const legacy = legacySchema.safeParse(await store.get('sso'));
    return signInSettingsSchema.parse({
      ...DEFAULT_SIGN_IN_SETTINGS,
      ...(legacy.success && !legacy.data.settings.passwordLogin
        ? { methods: ['sso'] }
        : {}),
    });
  }

  async getAdmin(): Promise<AdminSignInSettings> {
    return adminSignInSettingsSchema.parse({
      ...(await this.stored()),
      available: await this.deps.registry.available(),
      passwordForced: this.deps.passwordForced,
    });
  }

  private allowed(policy: SignInSettings) {
    return this.deps.passwordForced
      ? [...new Set([...policy.methods, 'password'])]
      : policy.methods;
  }

  async update(
    input: unknown,
    actor: UserProfile,
  ): Promise<AdminSignInSettings> {
    authorize(actor, 'settings.manage');
    const policy = parseInput(signInSettingsSchema, input);
    await this.deps.transactions.run('signIn.admission', async (store) => {
      const current = await this.stored(store);
      const available = await this.deps.registry.available();
      for (const key of ['methods', 'secondFactors'] as const) {
        const known = new Set([
          ...current[key],
          ...available[key].map((entry) => entry.id),
        ]);
        for (const [index, id] of policy[key].entries())
          if (!known.has(id))
            throw invalidInput(SignInErrors.SignInUnknown, [
              {
                path: `${key}.${index}`,
                message: SignInErrors.SignInUnknown,
              },
            ]);
      }
      let usable = false;
      if (
        policy.requireSecondFactor.length &&
        !policy.secondFactors.some(
          (id) => this.deps.registry.factor(id)?.enroll,
        )
      )
        throw invalidInput(SignInErrors.SignInFactorRequired, [
          {
            path: 'requireSecondFactor',
            message: SignInErrors.SignInFactorRequired,
          },
        ]);
      for (const id of this.allowed(policy)) {
        if (!available.methods.some((entry) => entry.id === id && entry.ready))
          continue;
        if (await this.deps.registry.method(id)?.usableBy(actor)) {
          usable = true;
          break;
        }
      }
      if (!usable)
        throw invalidInput(SignInErrors.SignInAccessRequired, [
          {
            path: 'methods',
            message: SignInErrors.SignInAccessRequired,
          },
        ]);
      await store.set('signIn', policy);
    });
    return this.getAdmin();
  }

  async otherUsable(
    user: UserProfile,
    store: SettingsRepository,
  ): Promise<boolean> {
    const policy = await this.stored(store);
    const available = await this.deps.registry.available();
    // A temporary password fallback is not an explicitly permitted alternative:
    // enabling SSO must not silently withdraw the administrator's only way in.
    for (const id of this.allowed(policy).filter((id) =>
      available.methods.some((entry) => entry.id === id && entry.ready),
    ))
      if (id !== 'sso' && (await this.deps.registry.method(id)?.usableBy(user)))
        return true;
    return false;
  }

  async effective(store = this.deps.settings): Promise<SignInSettings> {
    const policy = await this.stored(store);
    const available = await this.deps.registry.available();
    const methods = policy.methods.filter((id) =>
      available.methods.some((entry) => entry.id === id && entry.ready),
    );
    if (this.deps.passwordForced && !methods.includes('password'))
      methods.push('password');
    if (!methods.length) {
      methods.push('password');
      this.deps.logger.warn(
        'No allowed sign-in method is available; falling back to password.',
      );
    }
    const secondFactors = policy.secondFactors.filter((id) =>
      available.secondFactors.some((entry) => entry.id === id),
    );
    if (
      policy.requireSecondFactor.length &&
      !secondFactors.some((id) => this.deps.registry.factor(id)?.enroll)
    ) {
      if (!secondFactors.includes('totp')) secondFactors.push('totp');
      this.deps.logger.warn(
        'Required second factors are unavailable; falling back to core TOTP enrollment.',
      );
    }
    return {
      methods,
      secondFactors,
      requireSecondFactor: policy.requireSecondFactor,
    };
  }
}
