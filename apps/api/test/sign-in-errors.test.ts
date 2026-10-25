import { expect, test } from 'bun:test';
import { Errors as SdkErrors } from '@cms/sdk/errors';
import { Errors, unauthorized } from '#api/shared/errors';
import { toErrorResponse } from '#api/http/respond';
import { recordingLogger } from '#test/support/memory';

test('visitor-facing sign-in errors use SDK messages for frontend localization', async () => {
  for (const key of [
    'InvalidCredentials',
    'SecondFactorFailed',
    'InvalidInput',
    'RequestBodyNotJson',
    'RequestBodyTooLarge',
    'Internal',
    'AuthenticationRequired',
    'Forbidden',
    'TooManyAttempts',
    'CaptchaRequired',
    'CaptchaInvalid',
    'PasswordTokenInvalid',
    'SignInExpired',
    'SsoRateLimited',
    'SsoRequestExpired',
    'SsoAccountLinkedElsewhere',
  ] as const)
    expect(Errors[key]).toBe(SdkErrors[key]);
  const response = toErrorResponse(
    unauthorized(Errors.InvalidCredentials),
    recordingLogger().logger,
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { message: SdkErrors.InvalidCredentials },
  });
});
