import {
  signInContinueSchema,
  signInInfoSchema,
  signInStartSchema,
  signInStepSchema,
  chooseFactorSchema,
  signInSetupSchema,
  userFactorsSchema,
  adminUserSchema,
} from '@cms/sdk';
import type {
  SessionGrant,
  SignInStep,
  UserProfile,
  UserFactors,
} from '@cms/sdk';
import { Errors as SignInErrors } from '@cms/sdk/errors';
import type {
  UserDirectory,
  SecondFactorChallenge,
  SignInContinuation,
} from '@cms/sdk/plugin';
import { z } from 'zod';
import type { TokenIssuer } from '#api/domain/auth/ports';
import type {
  CoreSignInMethod,
  CoreSignInOutcome,
} from '#api/domain/auth/core-sign-in';
import type { SetupTokens } from '#api/domain/auth/setup-tokens';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import type { Clock, HookDispatcher } from '#api/domain/ports';
import type { SignInSettingsService } from '#api/domain/auth/sign-in-settings';
import { SIGN_IN_TTL_MS } from '#api/domain/auth/sign-in-transactions';
import type {
  SignInTransaction,
  SignInTransactions,
} from '#api/domain/auth/sign-in-transactions';
import type { AdmissionLimits } from '#api/domain/auth/sso-ports';
import type {
  Attempt,
  ProtectionService,
} from '#api/domain/security/protection-service';
import {
  Errors,
  conflict,
  rateLimited,
  unauthorized,
  expiredSignIn,
} from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export type SignInVisitor = Omit<Attempt, 'action' | 'account'>;

export interface SignInMethods {
  method(id: string): CoreSignInMethod | undefined;
  factor(id: string): SignInFactor | undefined;
}

export interface SignInFactor {
  label: string;
  enrolled(user: UserProfile): Promise<boolean>;
  challenge(user: UserProfile): Promise<SecondFactorChallenge | null>;
  verify(user: UserProfile, step: SignInContinuation): Promise<boolean>;
  credentials?(
    user: UserProfile,
  ): Promise<{ id: string; label: string; createdAt?: string }[]>;
  remove?(user: UserProfile, credential: string): Promise<boolean>;
  enroll?: {
    begin(user: UserProfile): Promise<SecondFactorChallenge | null>;
    finish(user: UserProfile, step: SignInContinuation): Promise<boolean>;
  };
}

const pendingState = z.object({
  kind: z.enum(['fields', 'redirect', 'webauthn']),
  state: z.unknown().optional(),
});

/** Method and second-factor orchestration over single-use, client-bound handles. */
export class SignInService {
  constructor(
    private readonly deps: {
      registry: SignInMethods;
      settings: Pick<SignInSettingsService, 'effective'>;
      transactions: SignInTransactions;
      tokens: TokenIssuer;
      setupTokens?: SetupTokens;
      factorChanges: SettingsTransactions;
      users: UserDirectory;
      clock: Clock;
      limits: AdmissionLimits;
      protection: Pick<ProtectionService, 'check'>;
      hooks: HookDispatcher;
      siteUrl: () => Promise<string>;
      session: (
        user: UserProfile,
        identityId?: string | null,
      ) => Promise<SessionGrant>;
    },
  ) {}

  async info() {
    const policy = await this.deps.settings.effective();
    const methods = [];
    const setup = [];
    for (const id of policy.methods) {
      const method = this.deps.registry.method(id);
      if (!method || !(await (method.ready?.() ?? true))) continue;
      const dto = {
        id,
        label: method.label,
        fields: method.fields ?? [],
        options: (await method.options?.()) ?? [],
      };
      methods.push(dto);
      if (method.setup)
        setup.push({ ...dto, fields: method.setup.fields ?? dto.fields });
    }
    return signInInfoSchema.parse({
      methods,
      setup,
      passwordReset: policy.methods.includes('password'),
    });
  }

  private fail(
    method: string,
    account: string | null = null,
    message: string = Errors.InvalidCredentials,
  ): never {
    void this.deps.hooks.emit('user.signInFailed', { method, account });
    throw unauthorized(message);
  }

  private expired(account: string | null = null): never {
    void this.deps.hooks.emit('user.signInFailed', {
      method: 'unknown',
      account,
    });
    throw expiredSignIn();
  }

  private async method(id: string) {
    const policy = await this.deps.settings.effective();
    const method = this.deps.registry.method(id);
    if (
      !policy.methods.includes(id) ||
      !method ||
      !(await (method.ready?.() ?? true))
    )
      return this.fail(id);
    return method;
  }

  private protect(
    values: Readonly<Record<string, string>>,
    visitor: SignInVisitor,
  ) {
    return this.deps.protection.check({
      ...visitor,
      action: 'login',
      account: values.email?.toLowerCase(),
    });
  }

  async start(
    id: string,
    input: unknown,
    visitor: SignInVisitor,
  ): Promise<SignInStep> {
    const parsed = parseInput(signInStartSchema, input);
    const method = await this.method(id);
    if (method.fields?.length || Object.keys(parsed.values).length)
      await this.protect(parsed.values, visitor);
    const outcome = await method.begin({
      values: parsed.values,
      option: parsed.option ?? null,
      address: visitor.address,
      client: visitor.client,
      callbackUrl: `${await this.deps.siteUrl()}/admin/sign-in/callback`,
    });
    return this.advance(
      {
        handleHash: '',
        stage: 'primary',
        methodId: id,
        factorId: null,
        userId: null,
        setupTokenHash: null,
        state: null,
        clientKey: this.deps.tokens.digest(visitor.client ?? 'unverified'),
        expiresAt: new Date(this.deps.clock.now().getTime() + SIGN_IN_TTL_MS),
      },
      outcome,
      parsed.values.email ?? null,
    );
  }

  async setup(
    id: string,
    input: unknown,
    visitor: SignInVisitor,
  ): Promise<SignInStep> {
    const parsed = parseInput(signInSetupSchema, input);
    const method = await this.method(id);
    if (!method.setup || !this.deps.setupTokens) return this.fail(id);
    if (
      (method.setup.fields ?? method.fields)?.length ||
      Object.keys(parsed.values).length
    )
      await this.protect(parsed.values, visitor);
    const setupTokenHash = this.deps.tokens.digest(parsed.token);
    const token = await this.deps.setupTokens.find(
      setupTokenHash,
      this.deps.clock.now(),
    );
    const user = token && (await this.deps.users.findById(token.userId));
    if (!token || !user) return this.fail(id);
    const outcome = await method.setup.begin(user, {
      option: parsed.option ?? null,
      values: parsed.values,
      address: visitor.address,
      client: visitor.client,
      callbackUrl: `${await this.deps.siteUrl()}/admin/sign-in/callback`,
    });
    return this.advance(
      {
        handleHash: '',
        stage: 'setup',
        methodId: id,
        factorId: null,
        userId: user.id,
        setupTokenHash,
        state: null,
        clientKey: this.deps.tokens.digest(visitor.client ?? 'unverified'),
        expiresAt: new Date(
          Math.min(
            token.expiresAt.getTime(),
            this.deps.clock.now().getTime() + SIGN_IN_TTL_MS,
          ),
        ),
      },
      outcome,
      parsed.values.email ?? null,
    );
  }

  async continue(
    input: unknown,
    visitor: SignInVisitor,
    actor?: UserProfile,
  ): Promise<SignInStep> {
    const parsed = parseInput(signInContinueSchema, input);
    return this.use(parsed.transaction, visitor, async (row) => {
      if (row.stage === 'account' && (!actor || actor.id !== row.userId))
        return this.fail(row.methodId);
      const method =
        row.stage === 'account' ? undefined : await this.method(row.methodId);
      const state = pendingState.safeParse(row.state);
      if (!state.success) return this.fail(row.methodId);
      if (state.data.kind === 'fields' || Object.keys(parsed.values).length)
        await this.protect(parsed.values, visitor);
      const continuation = {
        state: state.data.state,
        values: parsed.values,
        credential: parsed.credential ?? null,
        query: parsed.query ?? null,
        address: visitor.address,
      };
      if (row.stage === 'setup') {
        const token =
          row.setupTokenHash &&
          (await this.deps.setupTokens?.find(
            row.setupTokenHash,
            this.deps.clock.now(),
          ));
        const user = row.userId && (await this.deps.users.findById(row.userId));
        if (
          !token ||
          !user ||
          token.userId !== user.id ||
          !method?.setup?.continue
        )
          return this.fail(row.methodId);
        return this.advance(
          row,
          await method.setup.continue(user, continuation),
          parsed.values.email ?? null,
        );
      }
      if (
        row.stage === 'secondFactor' ||
        row.stage === 'enroll' ||
        row.stage === 'account'
      ) {
        const user = row.userId && (await this.deps.users.findById(row.userId));
        const policy = await this.deps.settings.effective();
        const factor =
          row.factorId && policy.secondFactors.includes(row.factorId)
            ? this.deps.registry.factor(row.factorId)
            : undefined;
        if (!user || !factor) return this.fail(row.methodId);
        const enrolling = row.stage === 'enroll' || row.stage === 'account';
        const verified = enrolling
          ? await factor.enroll?.finish(user, continuation)
          : (await factor.enrolled(user)) &&
            (await factor.verify(user, continuation));
        if (!verified)
          return this.fail(
            row.methodId,
            parsed.values.email ?? null,
            Errors.SecondFactorFailed,
          );
        if (enrolling)
          void this.deps.hooks.emit('user.secondFactorChanged', {
            user,
            factor: row.factorId!,
            change: 'enrolled',
          });
        if (row.stage === 'account') return { kind: 'done' };
        return this.advance(
          row,
          { kind: 'user', userId: user.id },
          parsed.values.email ?? null,
        );
      }
      if (row.stage !== 'primary' || !method?.continue)
        return this.fail(row.methodId);
      return this.advance(
        row,
        await method.continue(continuation),
        parsed.values.email ?? null,
      );
    });
  }

  async factors(actor: UserProfile): Promise<UserFactors> {
    const user = await this.deps.users.findById(actor.id);
    if (!user) return this.fail('account');
    const policy = await this.deps.settings.effective();
    const factors = [];
    for (const id of policy.secondFactors) {
      const factor = this.deps.registry.factor(id);
      if (!factor) continue;
      factors.push({
        id,
        label: factor.label,
        enrolled: await factor.enrolled(user),
        enrollable: !!factor.enroll,
        credentials: ((await factor.credentials?.(user)) ?? []).map(
          (credential) => ({
            id: credential.id,
            label: credential.label,
            createdAt: credential.createdAt ?? null,
          }),
        ),
      });
    }
    return userFactorsSchema.parse({
      factors,
      required: policy.requireSecondFactor.includes(user.role),
    });
  }

  async enroll(
    actor: UserProfile,
    id: string,
    visitor: SignInVisitor = {
      client: null,
      address: null,
      captchaToken: null,
    },
  ): Promise<SignInStep> {
    const user = await this.deps.users.findById(actor.id);
    const policy = await this.deps.settings.effective();
    const factor = policy.secondFactors.includes(id)
      ? this.deps.registry.factor(id)
      : undefined;
    if (!user || !factor?.enroll) return this.fail('account');
    const challenge = await factor.enroll.begin(user);
    if (!challenge) return this.fail('account');
    return this.advance(
      {
        handleHash: '',
        stage: 'account',
        methodId: 'account',
        factorId: id,
        userId: user.id,
        setupTokenHash: null,
        state: null,
        clientKey: this.deps.tokens.digest(visitor.client ?? 'unverified'),
        expiresAt: new Date(this.deps.clock.now().getTime() + SIGN_IN_TTL_MS),
      },
      challenge,
      null,
    );
  }

  async removeFactor(
    actor: UserProfile,
    id: string,
    credential: string,
  ): Promise<void> {
    // The same cross-process lock as policy saves prevents concurrent removals from
    // independently observing the other factor as the remaining way in.
    const notification = await this.deps.factorChanges.run(
      'signIn.admission',
      async () => {
        const user = await this.deps.users.findById(actor.id);
        if (!user) return this.fail('account');
        const list = await this.factors(user);
        const entry = list.factors.find((factor) => factor.id === id);
        const factor = entry && this.deps.registry.factor(id);
        if (!entry || !factor?.remove) return this.fail('account');
        if (
          entry.credentials.length &&
          !entry.credentials.some((item) => item.id === credential)
        )
          return this.fail('account');
        if (
          list.required &&
          !list.factors.some((item) => item.id !== id && item.enrolled) &&
          !entry.credentials.some((item) => item.id !== credential)
        )
          throw conflict(SignInErrors.SignInLastFactor);
        if (!(await factor.remove(user, credential)))
          return this.fail('account');
        return {
          user,
          factor: id,
          change: 'removed' as const,
        };
      },
    );
    void this.deps.hooks.emit('user.secondFactorChanged', notification);
  }

  async chooseFactor(
    input: unknown,
    visitor: SignInVisitor,
  ): Promise<SignInStep> {
    const parsed = parseInput(chooseFactorSchema, input);
    return this.use(parsed.transaction, visitor, async (row) => {
      await this.method(row.methodId);
      if (
        row.factorId ||
        !row.userId ||
        !['secondFactor', 'enroll'].includes(row.stage)
      )
        return this.fail(row.methodId);
      const user = await this.deps.users.findById(row.userId);
      const policy = await this.deps.settings.effective();
      const factor = policy.secondFactors.includes(parsed.factor)
        ? this.deps.registry.factor(parsed.factor)
        : undefined;
      if (!user || !factor) return this.fail(row.methodId);
      if (row.stage === 'secondFactor' && !(await factor.enrolled(user)))
        return this.fail(row.methodId);
      if (row.stage === 'enroll') {
        for (const id of policy.secondFactors)
          if (await this.deps.registry.factor(id)?.enrolled(user))
            return this.fail(row.methodId);
      }
      const challenge =
        row.stage === 'enroll'
          ? await factor.enroll?.begin(user)
          : await factor.challenge(user);
      if (!challenge) return this.fail(row.methodId);
      return this.advance({ ...row, factorId: parsed.factor }, challenge, null);
    });
  }

  private async use(
    handle: string,
    visitor: SignInVisitor,
    work: (row: SignInTransaction) => Promise<SignInStep>,
  ): Promise<SignInStep> {
    const hash = this.deps.tokens.digest(handle);
    const row = await this.deps.transactions.acquire(
      hash,
      this.deps.tokens.digest(visitor.client ?? 'unverified'),
      this.deps.clock.now(),
    );
    if (!row) return this.expired();
    try {
      const step = await work(row);
      if (step.kind === 'session' || step.kind === 'done') {
        if (
          !(await this.deps.transactions.replace(
            hash,
            null,
            this.deps.clock.now(),
          ))
        )
          return this.expired();
      }
      return step;
    } finally {
      await this.deps.transactions.release(hash, this.deps.clock.now());
    }
  }

  private async save(row: SignInTransaction) {
    const transaction = this.deps.tokens.issue();
    const next = { ...row, handleHash: this.deps.tokens.digest(transaction) };
    const now = this.deps.clock.now();
    if (row.handleHash) {
      if (!(await this.deps.transactions.replace(row.handleHash, next, now)))
        return this.expired();
    } else if (
      !(await this.deps.transactions.admit(next, now, this.deps.limits))
    )
      throw rateLimited(Errors.TooManyAttempts);
    return transaction;
  }

  private async advance(
    row: SignInTransaction,
    outcome: CoreSignInOutcome,
    account: string | null,
  ): Promise<SignInStep> {
    if (outcome.kind === 'failed') return this.fail(row.methodId, account);
    if (row.expiresAt <= this.deps.clock.now()) return this.expired(account);
    if (outcome.kind === 'user') {
      // Core's passkey assertion only returns a user after cryptographic UV verification.
      // Setup is a registration, not an assertion; plugin method ids cannot equal "passkey".
      const verifiedPasskey =
        row.methodId === 'passkey' && row.stage === 'primary' && !row.factorId;
      if (row.stage === 'setup') {
        if (
          !row.userId ||
          outcome.userId !== row.userId ||
          !row.setupTokenHash ||
          !(await ('commitSetup' in outcome && outcome.commitSetup
            ? outcome.commitSetup(row.setupTokenHash, this.deps.clock.now())
            : this.deps.setupTokens?.consume(
                row.setupTokenHash,
                row.userId,
                this.deps.clock.now(),
              )))
        )
          return this.fail(row.methodId, account);
        row = { ...row, stage: 'primary', setupTokenHash: null };
      }
      if ('identityId' in outcome)
        row = { ...row, identityId: outcome.identityId ?? null };
      const user = await this.deps.users.findById(outcome.userId);
      if (!user) return this.fail(row.methodId, account);
      // Validate the whole hook payload. Reject identity/context edits so neither core
      // nor later plugins see a substituted user, method, or undeclared user data.
      const profileSchema = adminUserSchema.strict();
      const profile = JSON.stringify(profileSchema.parse(user));
      const context = {
        user: profileSchema.refine(
          (value) => JSON.stringify(value) === profile,
        ),
        method: z.literal(row.methodId),
      };
      const allowedSchema = z.strictObject({
        ...context,
        allowed: z.boolean(),
      });
      const requiredSchema = z.strictObject({
        ...context,
        required: z.boolean(),
      });
      let allowed = true;
      await this.deps.hooks.applyFilter(
        'user.signInAllowed',
        {
          user,
          method: row.methodId,
          allowed,
        },
        (value) => {
          const parsed = allowedSchema.safeParse(value);
          if (!parsed.success || (!allowed && parsed.data.allowed))
            return false;
          allowed = allowed && parsed.data.allowed;
          return true;
        },
      );
      if (!allowed) return this.fail(row.methodId, account);
      const policy = await this.deps.settings.effective();
      let required =
        !verifiedPasskey && policy.requireSecondFactor.includes(user.role);
      await this.deps.hooks.applyFilter(
        'user.secondFactorRequired',
        {
          user,
          method: row.methodId,
          required,
        },
        (value) => {
          const parsed = requiredSchema.safeParse(value);
          // Rejecting the filter result makes HookBus warn; no plugin may undo a requirement.
          if (!parsed.success || (required && !parsed.data.required))
            return false;
          required = required || parsed.data.required;
          return true;
        },
      );
      const enrolled = [];
      const enrollable = [];
      for (const id of policy.secondFactors) {
        const factor = this.deps.registry.factor(id);
        if (!factor) continue;
        const choice = { id, label: factor.label };
        if (await factor.enrolled(user)) enrolled.push(choice);
        if (factor.enroll) enrollable.push(choice);
      }
      if (
        !row.factorId &&
        (required || (!verifiedPasskey && enrolled.length))
      ) {
        const kind = enrolled.length ? 'secondFactor' : 'enroll';
        const factors = enrolled.length ? enrolled : enrollable;
        if (!factors.length) return this.fail(row.methodId, account);
        const transaction = await this.save({
          ...row,
          stage: kind,
          userId: user.id,
          state: null,
        });
        return signInStepSchema.parse({ kind, factors, transaction });
      }
      if (row.factorId && !policy.secondFactors.includes(row.factorId))
        return this.fail(row.methodId, account);
      if (
        !(await this.deps.settings.effective()).methods.includes(row.methodId)
      )
        return this.fail(row.methodId, account);
      const session = await this.deps.session(user, row.identityId ?? null);
      void this.deps.hooks.emit('user.signedIn', {
        user,
        method: row.methodId,
        secondFactor: row.factorId ?? (verifiedPasskey ? 'passkey' : null),
      });
      return signInStepSchema.parse({ kind: 'session', session });
    }
    const transaction = await this.save({
      ...row,
      state: { kind: outcome.kind, state: outcome.state ?? null },
    });
    if (outcome.kind === 'redirect')
      return signInStepSchema.parse({
        kind: 'redirect',
        url: outcome.url,
        transaction,
        expiresAt: row.expiresAt.toISOString(),
      });
    if (outcome.kind === 'webauthn')
      return signInStepSchema.parse({
        kind: 'webauthn',
        ceremony: outcome.ceremony,
        options: outcome.options,
        display: outcome.display ?? [],
        transaction,
      });
    return signInStepSchema.parse({
      kind: 'fields',
      fields: outcome.fields,
      display: outcome.display ?? [],
      message: outcome.message,
      transaction,
    });
  }
}
