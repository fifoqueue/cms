import { describe, expect, test } from 'bun:test';
import { CALLOUT_VARIANTS, calloutAttributesSchema } from '#sdk/callout';

describe('callout attributes', () => {
  test('every variant and the dismissible flag are accepted', () => {
    expect(calloutAttributesSchema.safeParse({}).success).toBe(true);
    for (const variant of CALLOUT_VARIANTS)
      expect(
        calloutAttributesSchema.safeParse({ variant, dismissible: true })
          .success,
      ).toBe(true);
  });

  test('invalid variants and options are rejected', () => {
    for (const attrs of [
      { variant: 'purple' },
      { variant: 'Info' },
      { variant: 'info alert' },
      { variant: null },
      { variant: 1 },
      { dismissible: 'true' },
      { dismissible: 1 },
      { onclick: 'alert(1)' },
    ])
      expect(calloutAttributesSchema.safeParse(attrs).success).toBe(false);
  });
});
