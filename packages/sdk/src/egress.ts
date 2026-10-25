import { z } from 'zod';
import { Errors } from '#sdk/errors';

export const EGRESS_SERVICES = [
  'oidc',
  'search',
  'smtp',
  'email-api',
  'webhook',
] as const;
export type EgressService = (typeof EGRESS_SERVICES)[number];

const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .transform((host) =>
    (host.startsWith('[') && host.endsWith(']')
      ? host.slice(1, -1)
      : host
    ).toLowerCase(),
  )
  .refine(
    (host) => /^[a-z0-9.:-]+$/i.test(host) && !host.includes('..'),
    Errors.EgressHostInvalid,
  );

const addressSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[0-9a-f:.]+(?:\/\d{1,3})?$/i, Errors.EgressAddressInvalid);

export const egressRuleSchema = z.strictObject({
  service: z.enum(EGRESS_SERVICES),
  host: hostSchema,
  port: z.number().int().min(1).max(65_535),
  /** Exact IP addresses or CIDR ranges this host may resolve to. */
  addresses: z.array(addressSchema).min(1).max(32),
});

export type EgressRule = z.output<typeof egressRuleSchema>;

export const egressSettingsInputSchema = z.strictObject({
  rules: z.array(egressRuleSchema).max(64),
});

export type EgressSettingsInput = z.input<typeof egressSettingsInputSchema>;

/** Environment rules are visible but cannot be changed in the admin area. */
export const adminEgressSettingsSchema = egressSettingsInputSchema.extend({
  environmentRules: z.array(egressRuleSchema),
});

export type AdminEgressSettings = z.output<typeof adminEgressSettingsSchema>;
