import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { Path } from '$app/types';
import { getContext, setContext } from 'svelte';
import { toast } from 'svelte-sonner';
import { errorMessage } from '#lib/admin/form-errors.js';
import type { FormError } from '#lib/admin/form-errors.js';
import type { Messages } from '#lib/i18n/index.js';

/**
 * Completion feedback: toasts shown by the `Toasts` component of the admin and public layouts.
 * Each toast's text is its id, so the same outcome reported twice refreshes one toast instead of
 * stacking two.
 */

const KEY = Symbol('toasts');

/** `true` under a mounted toaster; `false` for screens that keep every message inline. */
export const provideToasts = (enabled: boolean) => setContext(KEY, enabled);

/** Whether outcomes below the caller are announced as toasts. */
export const useToasts = () => getContext<boolean | undefined>(KEY) === true;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Long enough to reach an Undo or View button. */
const ACTION_DURATION = 10_000;
const ERROR_DURATION = 8_000;

export const notifySuccess = (
  text: string,
  options: { description?: string; action?: ToastAction } = {},
) =>
  toast.success(text, {
    id: text,
    description: options.description,
    action: options.action,
    duration: options.action ? ACTION_DURATION : undefined,
  });

export const notifyFailure = (text: string, description?: string) =>
  toast.error(text, { id: text, description, duration: ERROR_DURATION });

/** A background save: no icon and brief; each one replaces the last of its `id`. */
export const notifyQuietly = (text: string, id: string) =>
  toast(text, { id, duration: 2_000 });

/** A form action's result: a catalog `notice` on success, or a refusal (`failFrom`). */
export interface ActionData extends FormError {
  notice?: string;
  /** For a notice whose catalog entry counts (`(count) => text`). */
  count?: number;
}

/** A notice's text: its catalog entry (counted with `count`), else the notice as given. */
export const noticeText = (
  m: Messages,
  data: Pick<ActionData, 'notice' | 'count'>,
) => {
  const { notice, count } = data;
  if (!notice) return '';
  const entry = (m as Record<string, unknown>)[notice];
  if (typeof entry === 'string') return entry;
  // A counted notice without its count has no text to show.
  if (typeof entry === 'function')
    return typeof count === 'number'
      ? (entry as (count: number) => string)(count)
      : '';
  return notice;
};

let forgetting: Promise<unknown> = Promise.resolve();

/**
 * Takes one-shot parameters (a redirect's notice) out of the address once announced, so a
 * reload does not repeat them. A shallow replacement: nothing reloads, scroll and focus stay.
 * Calls run in turn, each from the address the previous one left.
 */
export const forgetParams = (...names: string[]) => {
  const run = async () => {
    const url = new URL(location.href);
    if (!names.some((name) => url.searchParams.has(name))) return;
    for (const name of names) url.searchParams.delete(name);
    await goto(resolve(`${url.pathname}${url.search}${url.hash}` as Path), {
      state: page.state,
      shallow: true,
      replace: true,
    });
  };
  forgetting = forgetting.then(run, run);
};

const announced = new WeakSet<object>();

/** Whether `result` is announced for the first time (and is from now on). */
const first = (result: object) => {
  if (announced.has(result)) return false;
  announced.add(result);
  return true;
};

/** A bulk action's outcome (`eachBounded`): its count, and an error when items failed. */
export const announceBulk = (
  m: Messages,
  result: { done: number; failed: unknown[] },
) => {
  if (!first(result)) return;
  const done = m.bulkDone(result.done);
  if (result.failed.length)
    notifyFailure(`${done} · ${m.bulkFailed(result.failed.length)}`);
  else notifySuccess(done);
};

/**
 * Shows an action result once, however many components display it: the notice as a success
 * toast, a refusal's message as an error toast. Field issues stay with the form.
 */
export const announceResult = (
  i18n: { m: Messages; language: string },
  data: ActionData | null | undefined,
  action?: ToastAction,
) => {
  if (!data || !first(data)) return;
  if (data.message) {
    notifyFailure(errorMessage(i18n.m, i18n.language, data));
    return;
  }
  const text = noticeText(i18n.m, data);
  if (text) notifySuccess(text, { action });
};
