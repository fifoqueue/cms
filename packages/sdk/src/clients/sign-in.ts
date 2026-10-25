import { visitorHeaders } from '#sdk/clients/security';
import type { Visitor } from '#sdk/clients/security';
import {
  adminSignInSettingsSchema,
  signInInfoSchema,
  signInStepSchema,
  userFactorsSchema,
} from '#sdk/sign-in';
import type {
  AdminSignInSettings,
  ChooseFactorInput,
  SignInContinueInput,
  SignInInfo,
  SignInSettingsInput,
  SignInSetupInput,
  SignInStartInput,
  SignInStep,
  UserFactors,
} from '#sdk/sign-in';
import type { Request } from '#sdk/transport';

const step = { response: signInStepSchema };

/**
 * The step-based sign-in flow shared by every method (core and plugin). `visitor` lets the API
 * rate-limit per visitor and accept a solved captcha.
 */
export const signInClient = (request: Request) => ({
  signIn: {
    info: () =>
      request<SignInInfo>('GET', '/api/v1/auth/sign-in', {
        response: signInInfoSchema,
      }),
    start: (method: string, input: SignInStartInput, visitor?: Visitor) =>
      request<SignInStep>(
        'POST',
        `/api/v1/auth/sign-in/${encodeURIComponent(method)}`,
        { ...step, json: input, headers: visitorHeaders(visitor) },
      ),
    /** Sets a method up from an emailed invitation or reset link. */
    setup: (method: string, input: SignInSetupInput, visitor?: Visitor) =>
      request<SignInStep>(
        'POST',
        `/api/v1/auth/sign-in/setup/${encodeURIComponent(method)}`,
        { ...step, json: input, headers: visitorHeaders(visitor) },
      ),
    continue: (input: SignInContinueInput, visitor?: Visitor) =>
      request<SignInStep>('POST', '/api/v1/auth/sign-in/continue', {
        ...step,
        json: input,
        headers: visitorHeaders(visitor),
      }),
    /** Picks the second factor to complete, or to enroll after an `enroll` step. */
    chooseFactor: (input: ChooseFactorInput, visitor?: Visitor) =>
      request<SignInStep>('POST', '/api/v1/auth/sign-in/factor', {
        ...step,
        json: input,
        headers: visitorHeaders(visitor),
      }),
  },
  /** The signed-in user's second factors. Enrollment continues with `signIn.continue`. */
  factors: {
    list: () =>
      request<UserFactors>('GET', '/api/v1/auth/factors', {
        response: userFactorsSchema,
      }),
    enroll: (factor: string, visitor?: Visitor) =>
      request<SignInStep>(
        'POST',
        `/api/v1/auth/factors/${encodeURIComponent(factor)}/enroll`,
        { ...step, headers: visitorHeaders(visitor) },
      ),
    remove: (factor: string, credential: string) =>
      request<void>(
        'DELETE',
        `/api/v1/auth/factors/${encodeURIComponent(factor)}/${encodeURIComponent(credential)}`,
      ),
  },
});

/** Settings → Sign-in (`settings.manage`). */
export const signInAdminClient = (request: Request) => ({
  signInSettings: {
    get: () =>
      request<AdminSignInSettings>('GET', '/api/v1/admin/sign-in', {
        response: adminSignInSettingsSchema,
      }),
    update: (input: SignInSettingsInput) =>
      request<AdminSignInSettings>('PUT', '/api/v1/admin/sign-in', {
        json: input,
        response: adminSignInSettingsSchema,
      }),
  },
});
