import { z } from 'zod';
import type {
  SecondFactorDefinition,
  SecondFactorChallenge,
} from '@cms/sdk/plugin';
import type { Clock, IdGenerator, SecretBox } from '#api/domain/ports';
import type {
  TotpAlgorithm,
  TotpRepository,
} from '#api/domain/auth/totp/ports';
import { Errors, unauthorized } from '#api/shared/errors';

export interface TotpDeps {
  secrets: TotpRepository;
  box: SecretBox;
  clock: Clock;
  ids: IdGenerator;
  totp: TotpAlgorithm;
  site: () => Promise<{ title: string }>;
}

const pending = z.object({
  userId: z.string(),
  sealed: z.string().min(1).max(1024),
});
const prompt = (): SecondFactorChallenge => ({
  kind: 'fields',
  fields: [
    {
      name: 'code',
      label: 'Authentication code',
      type: 'code',
      autocomplete: 'one-time-code',
      required: true,
    },
  ],
});

export const createTotpFactor = (deps: TotpDeps): SecondFactorDefinition => ({
  label: 'Authenticator app',
  enrolled: async (user) => !!(await deps.secrets.find(user.id)),
  challenge: () => prompt(),
  verify: async (user, step) => {
    const record = await deps.secrets.find(user.id);
    if (!record) return false;
    const secret = deps.box.open(record.sealedSecret);
    if (!secret) return false;
    const matched = deps.totp.match(
      secret,
      step.values.code ?? '',
      deps.clock.now(),
    );
    return (
      matched !== null &&
      (await deps.secrets.consume(record.id, matched, deps.box.seal(secret)))
    );
  },
  enroll: {
    begin: async (user) => {
      if (await deps.secrets.find(user.id))
        throw unauthorized(Errors.InvalidCredentials);
      const secret = deps.totp.secret();
      const issuer = (await deps.site()).title.replaceAll(':', '') || 'CMS';
      const query = Object.entries({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30',
      })
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('&');
      return {
        ...prompt(),
        display: [
          { kind: 'code', text: secret },
          {
            kind: 'qr',
            value: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?${query}`,
          },
        ],
        state: { userId: user.id, sealed: deps.box.seal(secret) },
      };
    },
    finish: async (user, step) => {
      const state = pending.safeParse(step.state);
      if (!state.success || state.data.userId !== user.id) return false;
      const secret = deps.box.open(state.data.sealed);
      if (!secret || !/^[A-Z2-7]{32}$/.test(secret)) return false;
      const now = deps.clock.now();
      const matched = deps.totp.match(secret, step.values.code ?? '', now);
      if (matched === null) return false;
      return deps.secrets.insert({
        id: deps.ids.next(),
        userId: user.id,
        sealedSecret: deps.box.seal(secret),
        lastStep: matched,
        createdAt: now,
      });
    },
  },
  credentials: async (user) => {
    const record = await deps.secrets.find(user.id);
    return record
      ? [
          {
            id: record.id,
            label: 'Authenticator app',
            createdAt: record.createdAt.toISOString(),
          },
        ]
      : [];
  },
  remove: (user, id) => deps.secrets.remove(user.id, id),
});
