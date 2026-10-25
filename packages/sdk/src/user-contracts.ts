import { z } from 'zod';
import type { Awaitable } from '#sdk/common';
import type { RoleDefinition } from '#sdk/roles';
import type { PrivacyRequest } from '#sdk/privacy';

export const extensionKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export interface RoleRegistrar {
  register(role: RoleDefinition): () => void;
}

const fieldBase = { label: z.string().trim().min(1).max(100) };
export const profileFieldSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...fieldBase,
    type: z.literal('text'),
    maxLength: z.number().int().min(1).max(10000).default(500),
  }),
  z.strictObject({
    ...fieldBase,
    type: z.literal('number'),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }),
  z.strictObject({ ...fieldBase, type: z.literal('boolean') }),
]);
export type ProfileField = z.input<typeof profileFieldSchema>;
export const profileValuesSchema = z.record(
  z.string().max(140),
  z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
);
export type ProfileValues = z.output<typeof profileValuesSchema>;
export const profileMetaSchema = z.strictObject({
  fields: z.array(
    z.object({ key: z.string(), definition: profileFieldSchema }),
  ),
  values: profileValuesSchema,
});
export interface ProfileFieldRegistrar {
  register(key: string, definition: ProfileField): () => void;
}

export const captchaProviderIdSchema = z
  .enum(['none', 'turnstile', 'hcaptcha', 'recaptcha'])
  .or(z.string().regex(/^plugin:[a-z][a-z0-9-]{0,63}:[a-z][a-z0-9-]{0,63}$/));
export interface CaptchaVerification {
  provider: string;
  secret: string;
  token: string;
  address: string | null;
  minimumScore: number;
}
/** CSP host sources, not URLs with paths, credentials or CSP directive syntax. */
export const captchaOriginSchema = z
  .string()
  .max(2048)
  .regex(
    /^https:\/\/(?:(?:\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[[a-f0-9:.]+\])(?::[0-9]{1,5})?$/i,
  )
  .refine((value) =>
    URL.canParse(value.replace(/^https:\/\/\*\./i, 'https://')),
  );

export const captchaWidgetAttributesSchema = z.record(
  z
    .string()
    .max(80)
    .regex(/^data-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  z.string().max(1024),
);

export const captchaWidgetSchema = z.strictObject({
  script: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .pipe(
      z.string().refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password && !url.hash;
      }),
    ),
  /** Null auto-renders; otherwise resolve this global function and call it per mount. */
  render: z
    .string()
    .max(256)
    .regex(/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*){0,3}$/)
    .nullable()
    .default(null),
  origins: z.array(captchaOriginSchema).max(10).default([]),
  attributes: captchaWidgetAttributesSchema.refine(
    (value) => Object.keys(value).length <= 20,
  ),
  responseField: z
    .string()
    .max(100)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
});
export type CaptchaWidget = z.output<typeof captchaWidgetSchema>;
export type CaptchaWidgetInput = z.input<typeof captchaWidgetSchema>;
export interface CaptchaProviderDefinition {
  label: string;
  /** Public, data-only widget metadata. Never put secrets here. */
  widget?: CaptchaWidgetInput;
  verify(input: CaptchaVerification): Awaitable<boolean>;
}
export interface CaptchaRegistrar {
  register(key: string, provider: CaptchaProviderDefinition): () => void;
}

export const privacyErasureResultSchema = z.strictObject({
  erased: z.number().int().nonnegative(),
  retained: z.number().int().nonnegative(),
  messages: z.array(z.string().max(500)).max(20).default([]),
});
export type PrivacyErasureResult = z.output<typeof privacyErasureResultSchema>;
export const privacyErasureReportSchema = z.strictObject({
  results: z.record(z.string(), privacyErasureResultSchema),
  failed: z.array(z.string()),
});
export type PrivacyErasureReport = z.output<typeof privacyErasureReportSchema>;
/** Idempotent: an eraser may finish after its timeout; it must scope all writes to this subject. */
export interface PrivacyEraser {
  erase(
    request: PrivacyRequest,
  ): Awaitable<z.input<typeof privacyErasureResultSchema>>;
}
export interface PrivacyEraserRegistrar {
  register(key: string, eraser: PrivacyEraser): () => void;
}
