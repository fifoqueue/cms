import { expect, test } from 'bun:test';
import { apiErrorBodySchema } from '@cms/sdk';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import {
  Errors,
  ServerErrors,
  invalidInput,
  issueParams,
  paramsOf,
  withParams,
} from '#api/shared/errors';

// Readers' catalogs key on the SDK text; an API-only or interpolated message cannot be translated.
test('every message that can reach a response is the SDK catalog text', () => {
  const visible = Object.entries(Errors).filter(
    ([key]) => !Object.hasOwn(ServerErrors, key),
  );
  const sdk: Record<string, unknown> = SdkErrors;
  expect(visible.length).toBeGreaterThan(0);
  for (const [key, message] of visible)
    expect<unknown[]>([key, message]).toEqual([key, sdk[key]]);
});

test('SDK catalog texts are fixed strings', () => {
  for (const [key, message] of Object.entries(SdkErrors))
    expect({ key, type: typeof message }).toEqual({ key, type: 'string' });
});

test('issue params cross the client boundary only within their bounds', () => {
  const body = (issues: unknown) =>
    apiErrorBodySchema.parse({
      error: { code: 'invalid_input', message: Errors.MediaTooLarge, issues },
    }).error.issues;

  const issues = withParams(Errors.MediaTooLarge, {
    maxBytes: 1024,
    name: 'x'.repeat(600),
  });
  expect(body(issues)).toEqual([
    {
      path: '',
      message: Errors.MediaTooLarge,
      params: { maxBytes: 1024, name: 'x'.repeat(500) },
    },
  ]);
  const many = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`k${index}`, index]),
  );
  expect(body([{ path: '', message: 'm', params: many }])).toBeUndefined();
  expect(
    body([{ path: '', message: 'm', params: { nested: { secret: 'x' } } }]),
  ).toBeUndefined();
});

test('every params source shares one normalizer within the SDK bounds', () => {
  const nine = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`k${index}`, index]),
  );
  expect(Object.keys(issueParams(nine)!)).toHaveLength(8);
  expect(
    issueParams({
      ['k'.repeat(41)]: 'dropped',
      nested: { secret: 'dropped' },
      infinite: Infinity,
      long: 'x'.repeat(600),
      count: 2,
    }),
  ).toEqual({ long: 'x'.repeat(500), count: 2 });
  expect(issueParams({ nested: [] })).toBeUndefined();
  // A refusal's first issue gives its params, bounded the same way.
  const refusal = invalidInput(Errors.SlugInUse, [
    {
      path: 'slug',
      message: Errors.SlugInUse,
      params: { slug: 's'.repeat(900) },
    },
  ]);
  expect(paramsOf(refusal)).toEqual({ slug: 's'.repeat(500) });
  expect(paramsOf(invalidInput(Errors.SlugInUse))).toBeUndefined();
});
