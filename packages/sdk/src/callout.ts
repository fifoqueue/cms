import { z } from 'zod';

/** Callout (alert) styles, after the Bootstrap alert palette of Simple Alert Blocks. */
export const CALLOUT_VARIANTS = [
  'primary',
  'secondary',
  'success',
  'danger',
  'warning',
  'info',
  'light',
  'dark',
] as const;

export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

/** Attribute allowlist of the `callout` node; absent attributes take the node defaults. */
export const calloutAttributesSchema = z
  .strictObject({
    variant: z.enum(CALLOUT_VARIANTS),
    dismissible: z.boolean(),
  })
  .partial();

export type CalloutAttributes = z.infer<typeof calloutAttributesSchema>;
