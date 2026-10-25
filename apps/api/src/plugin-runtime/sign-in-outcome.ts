import { z } from 'zod';
import { signInStateSchema } from '#api/domain/auth/sign-in-state';
import { signInDisplaySchema, signInFieldSchema } from '@cms/sdk';
import type { CoreSignInOutcome } from '#api/domain/auth/core-sign-in';

/** Plugin state is persisted, never exposed as part of a public step. */
const state = signInStateSchema.optional();

const fields = z.object({
  kind: z.literal('fields'),
  fields: z.array(signInFieldSchema).min(1).max(10),
  display: z.array(signInDisplaySchema).max(10).optional(),
  message: z.string().max(500).optional(),
  state,
});

const webauthn = z.object({
  kind: z.literal('webauthn'),
  ceremony: z.enum(['get', 'create']),
  options: z.record(z.string(), z.json()),
  display: z.array(signInDisplaySchema).max(10).optional(),
  state,
});

export const secondFactorChallengeSchema = z.discriminatedUnion('kind', [
  fields,
  webauthn,
]);

/** Explicit projections prevent private implementation fields reaching the flow engine. */
export const signInOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), userId: z.string().min(1).max(128) }),
  z.object({
    kind: z.literal('redirect'),
    url: z.url().refine((value) => {
      const url = new URL(value);
      return (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    }),
    state,
  }),
  fields,
  webauthn,
  z.object({ kind: z.literal('failed') }),
]);

/** Only genuine core registrations can return a deferred atomic setup finalizer. */
export const coreSignInOutcomeSchema = z
  .unknown()
  .transform((value): CoreSignInOutcome => {
    const outcome = signInOutcomeSchema.parse(value);
    if (outcome.kind !== 'user') return outcome;
    const extra = z
      .object({
        identityId: z.string().min(1).max(36).nullable().optional(),
        commitSetup: z
          .custom<(tokenHash: string, now: Date) => Promise<boolean>>(
            (candidate) => typeof candidate === 'function',
          )
          .optional(),
      })
      .parse(value);
    return { ...outcome, ...extra };
  });
