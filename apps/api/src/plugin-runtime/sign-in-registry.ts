import { z } from 'zod';
import {
  secondFactorIdSchema,
  signInMethodIdSchema,
  signInMethodSchema,
} from '@cms/sdk';
import type {
  AuthenticationRegistrar,
  SecondFactorDefinition,
  SignInMethodDefinition,
  UserDirectory,
} from '@cms/sdk/plugin';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { Errors } from '#api/shared/errors';
import {
  secondFactorChallengeSchema,
  signInOutcomeSchema,
  coreSignInOutcomeSchema,
} from '#api/plugin-runtime/sign-in-outcome';
import type { CoreSignInMethod } from '#api/domain/auth/core-sign-in';

interface Entry<T> {
  id: string;
  owner: string;
  core: boolean;
  definition: T;
}

const label = z.string().trim().min(1).max(100);
const credentials = z
  .array(
    z.object({
      id: z.string().min(1).max(128),
      label: z.string().max(100),
      createdAt: z.string().optional(),
    }),
  )
  .max(100);

/** Core and plugins share registration, isolation and revocation semantics. */
export class SignInRegistry {
  private readonly methods = new Map<string, Entry<SignInMethodDefinition>>();
  private readonly factors = new Map<string, Entry<SecondFactorDefinition>>();

  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}

  /** Only the composition root receives the registry; plugin contexts receive registrar(). */
  core(users: UserDirectory): AuthenticationRegistrar {
    return this.registration('core', users, true);
  }

  registrar(owner: string, users: UserDirectory): AuthenticationRegistrar {
    return this.registration(owner, users, false);
  }

  private registration(
    owner: string,
    users: UserDirectory,
    core: boolean,
  ): AuthenticationRegistrar {
    return {
      users,
      signInMethod: (key, definition) =>
        this.register(
          this.methods,
          owner,
          key,
          definition,
          signInMethodIdSchema,
          core,
        ),
      secondFactor: (key, definition) =>
        this.register(
          this.factors,
          owner,
          key,
          definition,
          secondFactorIdSchema,
          core,
        ),
    };
  }

  private register<T extends { label: string }>(
    map: Map<string, Entry<T>>,
    owner: string,
    key: string,
    definition: T,
    schema: z.ZodType<string>,
    core: boolean,
  ) {
    const id = core ? key : `plugin:${owner}:${key}`;
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) ||
      key.length > 64 ||
      !schema.safeParse(id).success ||
      !label.safeParse(definition.label).success ||
      map.has(id)
    )
      throw new Error(Errors.SignInRegistrationInvalid);
    const entry = { id, owner, core, definition: { ...definition } };
    map.set(id, entry);
    return () => {
      if (map.get(id) === entry) map.delete(id);
    };
  }

  revoke(owner: string) {
    for (const [id, entry] of this.methods)
      if (entry.owner === owner) this.methods.delete(id);
    for (const [id, entry] of this.factors)
      if (entry.owner === owner) this.factors.delete(id);
  }

  private async call<T, D>(
    map: Map<string, Entry<D>>,
    entry: Entry<D>,
    task: () => unknown,
    schema: z.ZodType<T>,
    fallback: T,
  ): Promise<T> {
    if (map.get(entry.id) !== entry) return fallback;
    if (entry.core) {
      const value = schema.parse(await task());
      return map.get(entry.id) === entry ? value : fallback;
    }
    const result = await isolate(
      async () => schema.parse(await task()),
      this.options.timeoutMs,
    );
    if (map.get(entry.id) !== entry) return fallback;
    if (result.ok) return result.value;
    this.options.logger.warn(
      `Authentication extension "${entry.id}" failed`,
      result.error,
    );
    return fallback;
  }

  method(id: string): CoreSignInMethod | undefined {
    const entry = this.methods.get(id);
    if (!entry) return;
    const method = entry.definition;
    const call = <T>(task: () => unknown, schema: z.ZodType<T>, fallback: T) =>
      this.call(this.methods, entry, task, schema, fallback);
    const outcome = (task: () => unknown) =>
      call(task, entry.core ? coreSignInOutcomeSchema : signInOutcomeSchema, {
        kind: 'failed',
      });
    const fields = (value: unknown) => {
      const parsed = signInMethodSchema.shape.fields.safeParse(value ?? []);
      if (parsed.success) return parsed.data;
      if (entry.core) return signInMethodSchema.shape.fields.parse(value);
      this.options.logger.warn(
        `Authentication extension "${entry.id}" returned invalid fields`,
      );
      return [];
    };
    return {
      label: method.label,
      fields: fields(method.fields),
      ready: () => call(() => method.ready?.() ?? true, z.boolean(), false),
      options: () =>
        call(
          () => method.options?.() ?? [],
          signInMethodSchema.shape.options,
          [],
        ),
      usableBy: (user) =>
        call(() => method.usableBy(structuredClone(user)), z.boolean(), false),
      begin: (request) => outcome(() => method.begin(structuredClone(request))),
      continue: method.continue
        ? (step) => outcome(() => method.continue!(structuredClone(step)))
        : undefined,
      setup: method.setup
        ? {
            fields:
              method.setup.fields === undefined
                ? undefined
                : fields(method.setup.fields),
            begin: (user, request) =>
              outcome(() =>
                method.setup!.begin(
                  structuredClone(user),
                  structuredClone(request),
                ),
              ),
            continue: method.setup.continue
              ? (user, step) =>
                  outcome(() =>
                    method.setup!.continue!(
                      structuredClone(user),
                      structuredClone(step),
                    ),
                  )
              : undefined,
          }
        : undefined,
    };
  }

  /** Failed challenges are null so callers must not offer or advance that factor. */
  factor(id: string) {
    const entry = this.factors.get(id);
    if (!entry) return;
    const factor = entry.definition;
    const call = <T>(task: () => unknown, schema: z.ZodType<T>, fallback: T) =>
      this.call(this.factors, entry, task, schema, fallback);
    type User = Parameters<SecondFactorDefinition['enrolled']>[0];
    type Step = Parameters<SecondFactorDefinition['verify']>[1];
    return {
      label: factor.label,
      enrolled: (user: User) =>
        call(() => factor.enrolled(structuredClone(user)), z.boolean(), false),
      challenge: (user: User) =>
        call(
          () => factor.challenge(structuredClone(user)),
          secondFactorChallengeSchema.nullable(),
          null,
        ),
      verify: (user: User, step: Step) =>
        call(
          () => factor.verify(structuredClone(user), structuredClone(step)),
          z.boolean(),
          false,
        ),
      credentials: (user: User) =>
        call(
          () => factor.credentials?.(structuredClone(user)) ?? [],
          credentials,
          [],
        ),
      remove: factor.remove
        ? (user: User, credential: string) =>
            call(
              async () => {
                await factor.remove!(structuredClone(user), credential);
                return true;
              },
              z.boolean(),
              false,
            )
        : undefined,
      enroll: factor.enroll
        ? {
            begin: (user: User) =>
              call(
                () => factor.enroll!.begin(structuredClone(user)),
                secondFactorChallengeSchema.nullable(),
                null,
              ),
            finish: (user: User, step: Step) =>
              call(
                () =>
                  factor.enroll!.finish(
                    structuredClone(user),
                    structuredClone(step),
                  ),
                z.boolean(),
                false,
              ),
          }
        : undefined,
    };
  }

  async available() {
    return {
      methods: await Promise.all(
        [...this.methods.values()].map(async ({ id, owner, definition }) => ({
          id,
          source: owner,
          label: definition.label,
          ready: await this.method(id)!.ready!(),
        })),
      ),
      secondFactors: [...this.factors.values()].map(
        ({ id, owner, definition }) => ({
          id,
          source: owner,
          label: definition.label,
        }),
      ),
    };
  }
}
