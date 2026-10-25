import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { SignInField, SignInStep } from '@cms/sdk';
import { CmsApiError } from '@cms/sdk/client';
import { authApi, contentApi } from '#lib/server/api.js';
import { Errors, failFrom, jsonField, text } from '#lib/server/errors.js';
import { RETURN_PARAM, returnPath } from '#lib/server/return-path.js';
import { startSession } from '#lib/server/session-cookie.js';
import {
  echoValues,
  fieldValues,
  redirectTarget,
} from '#lib/server/sign-in-view.js';
import {
  PERSONAL_FLOWS,
  clearPending,
  readPending,
  setPending,
} from '#lib/server/sso-cookie.js';
import type { PendingFlow, PendingSignIn } from '#lib/server/sso-cookie.js';
import { visitorOf } from '#lib/server/visitor.js';

type Event = Pick<
  RequestEvent,
  'fetch' | 'cookies' | 'url' | 'locals' | 'getClientAddress' | 'request'
>;

/** The step runner shared by every method and factor, core or plugin. */
export const stepPage = () => resolve('/admin/(auth)/sign-in');
const account = () => resolve('/admin/(app)/account');
/** The account page's two-step section, where enrollment steps are shown. */
export const ENROLL_ANCHOR = 'two-step';

export const loginPathOf = (fetch: typeof globalThis.fetch) =>
  contentApi(fetch)
    .site()
    .then((site) => site.loginPath)
    .catch(() => '/login');

/**
 * Whether password sign-in is allowed (public resets accepted, emailed links set a password).
 * Unknown counts as allowed: the API still refuses what it does not accept.
 */
export const passwordAllowed = (fetch: typeof globalThis.fetch) =>
  authApi(fetch)
    .signIn.info()
    .then((info) => info.passwordReset)
    .catch(() => true);

/** The flows the public step page runs; enrollment runs on the account page. */
export const PUBLIC_FLOWS: readonly PendingFlow[] = ['login', 'setup'];

/** Expired, used and unknown handles all answer 410 (`sign_in_expired`). */
const isExpired = (caught: unknown) =>
  caught instanceof CmsApiError && caught.status === 410;

/** Who a new pending step belongs to: the signed-in user for `enroll`/`link`, else nobody. */
export const ownerFor = (event: Pick<Event, 'locals'>, flow: PendingFlow) =>
  PERSONAL_FLOWS.includes(flow) ? (event.locals.user?.id ?? null) : null;

/**
 * Whether this request may use the pending step: an enrollment or link only by the user who
 * started it, so a step left behind never reaches the next person on the same browser.
 */
export const ownsPending = (
  event: Pick<Event, 'locals'>,
  pending: Pick<PendingSignIn, 'flow' | 'user'>,
) =>
  !PERSONAL_FLOWS.includes(pending.flow) ||
  (!!event.locals.user && pending.user === event.locals.user.id);

/** Only an enrollment belongs to the signed-in user; sign-ins and setups are anonymous. */
const apiFor = (event: Event, flow: PendingFlow) =>
  authApi(event.fetch, flow === 'enroll' ? event.locals.token : undefined);

/**
 * Follows a step: a session signs in and opens `back`, a redirect leaves for the provider, and
 * every other step is remembered and shown by its flow's page. Returns only when a setup has
 * finished without signing in (`done`).
 */
export const advance = async (
  event: Event,
  step: SignInStep,
  flow: PendingFlow,
  back: string | null,
  /** The method or factor whose step comes next, when known. */
  owner: string | null = null,
): Promise<{ done: true }> => {
  const { cookies, url } = event;
  if (step.kind === 'session') {
    clearPending(cookies, url);
    startSession(cookies, step.session, url);
    return redirect(303, returnPath(back, await loginPathOf(event.fetch)));
  }
  if (step.kind === 'done') {
    clearPending(cookies, url);
    if (flow === 'enroll')
      redirect(303, `${account()}?notice=factorEnrolled#${ENROLL_ANCHOR}`);
    return { done: true };
  }
  const user = ownerFor(event, flow);
  if (step.kind === 'redirect') {
    const target = redirectTarget(step);
    if (!target) {
      clearPending(cookies, url);
      error(502, Errors.SignInRedirectInvalid);
    }
    setPending(
      cookies,
      url,
      { transaction: step.transaction, flow, user, back, step: null, owner },
      step.expiresAt,
    );
    return redirect(303, target, { external: true });
  }
  setPending(cookies, url, {
    transaction: step.transaction,
    flow,
    user,
    back,
    step,
    owner,
  });
  return redirect(
    303,
    flow === 'enroll' ? `${account()}#${ENROLL_ANCHOR}` : stepPage(),
  );
};

/** A refused attempt keeps the step; an unknown transaction is forgotten so the flow restarts. */
const refused = <Extra extends object>(
  event: Event,
  caught: unknown,
  extra: Extra,
) => {
  if (isExpired(caught)) {
    clearPending(event.cookies, event.url);
    return failFrom(caught, { ...extra, expired: true });
  }
  return failFrom(caught, extra);
};

const pendingOf = (event: Event, flows: readonly PendingFlow[]) => {
  const pending = readPending(event.cookies, event.url);
  return pending?.step &&
    flows.includes(pending.flow) &&
    ownsPending(event, pending)
    ? (pending as PendingSignIn & { step: NonNullable<PendingSignIn['step']> })
    : null;
};

const expired = () => fail(400, { expired: true as const });

const credentialOf = (form: FormData) => {
  const value = jsonField(form, 'credential');
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
};

/** Answers the pending step with the posted fields, or the passkey response. */
export const continueStep = async (
  event: Event & Pick<RequestEvent, 'request'>,
  flows: readonly PendingFlow[],
) => {
  const pending = pendingOf(event, flows);
  if (!pending) return expired();
  const form = await event.request.formData();
  const fields = pending.step.kind === 'fields' ? pending.step.fields : [];
  const values = fieldValues(form, fields);
  let step: SignInStep;
  try {
    step = await apiFor(event, pending.flow).signIn.continue(
      {
        transaction: pending.transaction,
        values,
        credential:
          pending.step.kind === 'webauthn' ? credentialOf(form) : undefined,
      },
      visitorOf(event, form),
    );
  } catch (caught) {
    return refused(event, caught, { values: echoValues(values, fields) });
  }
  return advance(event, step, pending.flow, pending.back, pending.owner);
};

/** Picks the second factor to complete, or to set up when the role requires one. */
export const chooseFactor = async (
  event: Event & Pick<RequestEvent, 'request'>,
  flows: readonly PendingFlow[],
) => {
  const pending = pendingOf(event, flows);
  if (!pending) return expired();
  const form = await event.request.formData();
  const factor = text(form, 'factor');
  let step: SignInStep;
  try {
    step = await apiFor(event, pending.flow).signIn.chooseFactor(
      { transaction: pending.transaction, factor },
      visitorOf(event, form),
    );
  } catch (caught) {
    return refused(event, caught, {});
  }
  return advance(event, step, pending.flow, pending.back, factor);
};

/** Abandons the pending step and returns to where its flow started. */
export const cancelStep = async (event: Event) => {
  const pending = readPending(event.cookies, event.url);
  clearPending(event.cookies, event.url);
  if (pending?.flow === 'enroll')
    redirect(303, `${account()}#${ENROLL_ANCHOR}`);
  const loginPath = await loginPathOf(event.fetch);
  const back = pending?.back ? returnPath(pending.back, loginPath) : null;
  redirect(
    303,
    back && back !== '/admin'
      ? `${loginPath}?${new URLSearchParams({ [RETURN_PARAM]: back })}`
      : loginPath,
  );
};

/** A sign-in method's first step, from the public login page. */
export const startStep = async (event: Event, form: FormData, back: string) => {
  const method = text(form, 'method');
  const api = authApi(event.fetch);
  let fields: SignInField[] = [];
  let values: Record<string, string> = {};
  let step: SignInStep;
  try {
    // Only the fields the method declares are sent.
    fields =
      (await api.signIn.info()).methods.find(({ id }) => id === method)
        ?.fields ?? [];
    values = fieldValues(form, fields);
    step = await api.signIn.start(
      method,
      { option: text(form, 'option') || undefined, values },
      visitorOf(event, form),
    );
  } catch (caught) {
    return failFrom(caught, {
      back,
      method,
      values: echoValues(values, fields),
    });
  }
  await advance(event, step, 'login', back, method);
  return { done: true as const };
};

/** Sets a method up from an emailed invitation or reset link (`token`). */
export const setupStep = async (event: Event, form: FormData) => {
  const method = text(form, 'method');
  const api = authApi(event.fetch);
  let fields: SignInField[] = [];
  let values: Record<string, string> = {};
  let step: SignInStep;
  try {
    fields =
      (await api.signIn.info()).setup.find(({ id }) => id === method)?.fields ??
      [];
    values = fieldValues(form, fields);
    step = await api.signIn.setup(
      method,
      {
        token: text(form, 'token'),
        option: text(form, 'option') || undefined,
        values,
      },
      visitorOf(event, form),
    );
  } catch (caught) {
    return failFrom(caught, {
      method,
      values: echoValues(values, fields),
    });
  }
  return advance(event, step, 'setup', null, method);
};

/** Starts setting up a second factor for the signed-in user (account page). */
export const enrollStep = async (event: Event, factor: string) => {
  let step: SignInStep;
  try {
    // The API binds the step to this visitor; continuing it sends the same proof.
    step = await authApi(event.fetch, event.locals.token).factors.enroll(
      factor,
      visitorOf(event),
    );
  } catch (caught) {
    return failFrom(caught);
  }
  return advance(event, step, 'enroll', null, factor);
};

/** The enrollment waiting on the account page, if any. */
export const pendingEnrollment = (
  event: Pick<Event, 'cookies' | 'url' | 'locals'>,
) => {
  const pending = readPending(event.cookies, event.url);
  return pending?.step &&
    pending.flow === 'enroll' &&
    ownsPending(event, pending)
    ? { step: pending.step, owner: pending.owner ?? null }
    : null;
};
