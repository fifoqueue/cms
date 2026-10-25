import { z } from 'zod';
import type { UserProfile } from '@cms/sdk';
import type {
  SecondFactorDefinition,
  SecondFactorChallenge,
  SignInContinuation,
} from '@cms/sdk/plugin';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type { CoreSignInMethod } from '#api/domain/auth/core-sign-in';
import type {
  PasskeyRepository,
  PasskeyRecord,
  WebAuthn,
} from '#api/domain/auth/passkey/ports';
import { Errors, unauthorized } from '#api/shared/errors';

export interface PasskeyDeps {
  passkeys: PasskeyRepository;
  webauthn: WebAuthn;
  ids: IdGenerator;
  clock: Clock;
  site: () => Promise<{ siteUrl: string; title: string }>;
}

const base64 = z
  .string()
  .min(1)
  .max(1364)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine(
    (value) => Buffer.from(value, 'base64url').toString('base64url') === value,
  );
const stateSchema = z.object({
  ceremony: z.enum(['get', 'create']),
  challenge: z.string().min(1).max(1024),
  origin: z.string().max(2048),
  rpId: z.string().max(253),
  userId: z.string().max(128).nullable(),
  residentKeyRequired: z.boolean().default(false),
});
const clientDataSchema = z.object({ crossOrigin: z.boolean().optional() });
const ipAddress = z.union([z.ipv4(), z.ipv6()]);
const responseSchema = z
  .object({
    id: base64,
    rawId: base64,
    type: z.literal('public-key'),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    response: z
      .object({
        clientDataJSON: z.string().min(1).max(8192),
      })
      .passthrough(),
  })
  .passthrough()
  .refine((value) => value.id === value.rawId)
  .refine((value) => {
    const data = clientDataSchema.parse(
      JSON.parse(
        Buffer.from(value.response.clientDataJSON, 'base64url').toString(
          'utf8',
        ),
      ),
    );
    return data.crossOrigin !== true;
  });
const assertionSchema = responseSchema.and(
  z.object({
    response: z.object({
      authenticatorData: z.string().min(1).max(8192),
      signature: z.string().min(1).max(16384),
      userHandle: z.string().max(256).nullable().optional(),
    }),
  }),
);
const registrationSchema = responseSchema.and(
  z.object({
    response: z.object({
      attestationObject: z.string().min(1).max(65536),
      transports: z.array(z.string().max(32)).max(10).optional(),
    }),
  }),
);

const ceremonies = (deps: PasskeyDeps) => {
  const relyingParty = async () => {
    const site = await deps.site();
    if (!site.siteUrl) return null;
    try {
      const url = new URL(site.siteUrl);
      if (
        url.username ||
        url.password ||
        ipAddress.safeParse(url.hostname.replace(/^\[|\]$/g, '')).success ||
        (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && url.hostname === 'localhost'))
      )
        return null;
      return {
        origin: url.origin,
        rpId: url.hostname,
        title: site.title || url.hostname,
      };
    } catch {
      return null;
    }
  };
  const begin = async (
    user: UserProfile | null,
    ceremony: 'get' | 'create',
    residentKey: 'preferred' | 'required' = 'preferred',
  ): Promise<SecondFactorChallenge> => {
    const rp = await relyingParty();
    if (!rp) throw unauthorized(Errors.InvalidCredentials);
    const existing = user ? await deps.passkeys.list(user.id) : [];
    // Sixteen maximum-sized credential ids leave room below the 32 KiB auth-step budget.
    const credentials = existing.slice(0, 16).map((key) => ({
      id: Buffer.from(key.credentialId).toString('base64url'),
      transports: key.transports,
    }));
    const options =
      ceremony === 'create' && user
        ? await deps.webauthn.generateRegistrationOptions({
            rpID: rp.rpId,
            rpName: rp.title,
            userID: new TextEncoder().encode(user.id),
            userName: user.email,
            userDisplayName: user.name,
            attestationType: 'none',
            excludeCredentials: credentials,
            extensions: { credProps: true },
            authenticatorSelection: {
              residentKey,
              userVerification: 'required',
            },
          })
        : await deps.webauthn.generateAuthenticationOptions({
            rpID: rp.rpId,
            allowCredentials: credentials,
            userVerification: 'required',
          });
    return {
      kind: 'webauthn',
      ceremony,
      options: JSON.parse(JSON.stringify(options)) as Record<string, unknown>,
      state: {
        ceremony,
        challenge: options.challenge,
        origin: rp.origin,
        rpId: rp.rpId,
        userId: user?.id ?? null,
        residentKeyRequired:
          ceremony === 'create' && residentKey === 'required',
      },
    };
  };
  const finish = async (
    user: UserProfile | null,
    step: SignInContinuation,
    ceremony: 'get' | 'create',
  ): Promise<string | PasskeyRecord | null> => {
    try {
      const state = stateSchema.parse(step.state);
      const rp = await relyingParty();
      if (
        !rp ||
        state.ceremony !== ceremony ||
        state.userId !== (user?.id ?? null) ||
        state.origin !== rp.origin ||
        state.rpId !== rp.rpId
      )
        return null;
      const expected = {
        expectedChallenge: state.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpId,
        requireUserVerification: true,
      };
      if (ceremony === 'create') {
        if (!user) return null;
        const response = registrationSchema.parse(step.credential);
        const result = await deps.webauthn.verifyRegistrationResponse({
          ...expected,
          response,
        });
        if (!result.verified || !result.registrationInfo.userVerified)
          return null;
        const info = result.registrationInfo;
        const credentialId = Buffer.from(info.credential.id, 'base64url');
        if (credentialId.length > 1023) return null;
        const props = z
          .object({ rk: z.boolean().optional() })
          .optional()
          .parse(response.clientExtensionResults.credProps);
        if (state.residentKeyRequired && props?.rk === false) return null;
        return {
          id: deps.ids.next(),
          userId: user.id,
          credentialId,
          publicKey: info.credential.publicKey,
          counter: info.credential.counter,
          transports: info.credential.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          discoverable: state.residentKeyRequired || props?.rk === true,
          name: 'Passkey',
          createdAt: deps.clock.now(),
          lastUsedAt: null,
        };
      }
      const response = assertionSchema.parse(step.credential);
      const key = await deps.passkeys.find(
        Buffer.from(response.id, 'base64url'),
      );
      if (!key || (user && key.userId !== user.id)) return null;
      if (!user && !key.discoverable) return null;
      const handle = response.response.userHandle;
      if (
        (!user && !handle) ||
        (handle && handle !== Buffer.from(key.userId).toString('base64url'))
      )
        return null;
      const result = await deps.webauthn.verifyAuthenticationResponse({
        ...expected,
        response: {
          ...response,
          response: { ...response.response, userHandle: handle ?? undefined },
        },
        credential: {
          id: response.id,
          publicKey: key.publicKey,
          counter: key.counter,
          transports: key.transports,
        },
      });
      if (!result.verified || !result.authenticationInfo.userVerified)
        return null;
      const info = result.authenticationInfo;
      if (info.credentialDeviceType !== key.deviceType) return null;
      return (await deps.passkeys.use(
        key.id,
        key.counter,
        info.newCounter,
        info.credentialBackedUp,
        deps.clock.now(),
      ))
        ? key.userId
        : null;
    } catch {
      return null;
    }
  };
  return { relyingParty, begin, finish };
};

export const createPasskeyMethod = (deps: PasskeyDeps): CoreSignInMethod => {
  const flow = ceremonies(deps);
  return {
    label: 'Passkey',
    ready: async () => !!(await flow.relyingParty()),
    usableBy: async (user) =>
      (await deps.passkeys.list(user.id)).some((key) => key.discoverable),
    begin: async () => {
      try {
        return await flow.begin(null, 'get');
      } catch {
        return { kind: 'failed' };
      }
    },
    continue: async (step) => {
      const userId = await flow.finish(null, step, 'get');
      return typeof userId === 'string'
        ? { kind: 'user', userId }
        : { kind: 'failed' };
    },
    setup: {
      begin: async (user) => {
        try {
          return await flow.begin(user, 'create', 'required');
        } catch {
          return { kind: 'failed' };
        }
      },
      continue: async (user, step) => {
        const record = await flow.finish(user, step, 'create');
        if (!record || typeof record === 'string') return { kind: 'failed' };
        return {
          kind: 'user',
          userId: user.id,
          commitSetup: (tokenHash, now) =>
            deps.passkeys.register(record, tokenHash, now),
        };
      },
    },
  };
};

export const createPasskeyFactor = (
  deps: PasskeyDeps,
): SecondFactorDefinition => {
  const flow = ceremonies(deps);
  return {
    label: 'Passkey',
    enrolled: async (user) => (await deps.passkeys.list(user.id)).length > 0,
    challenge: (user) => flow.begin(user, 'get'),
    verify: async (user, step) =>
      (await flow.finish(user, step, 'get')) === user.id,
    enroll: {
      begin: (user) => flow.begin(user, 'create'),
      finish: async (user, step) => {
        const record = await flow.finish(user, step, 'create');
        return (
          !!record &&
          typeof record !== 'string' &&
          (await deps.passkeys.insert(record))
        );
      },
    },
    credentials: async (user) =>
      (await deps.passkeys.list(user.id)).map((key) => ({
        id: key.id,
        label: key.name,
        createdAt: key.createdAt.toISOString(),
      })),
    remove: (user, id) => deps.passkeys.remove(user.id, id),
  };
};
