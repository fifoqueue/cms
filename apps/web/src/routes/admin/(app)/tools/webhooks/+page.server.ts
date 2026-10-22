import { WEBHOOK_EVENTS } from '@cms/sdk';
import type { WebhookInput } from '@cms/sdk';
import { failFrom, text } from '#lib/server/errors.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  webhooks: (await adminFor(event).webhooks.list()).map((hook) => ({
    id: hook.id,
    url: hook.url,
    events: hook.events,
    enabled: hook.enabled,
    lastStatus: hook.lastStatus,
    lastError: hook.lastError,
    lastAttemptAt: hook.lastAttemptAt,
  })),
});

const input = (form: FormData): WebhookInput => ({
  url: text(form, 'url'),
  events: form
    .getAll('events')
    .filter((value): value is (typeof WEBHOOK_EVENTS)[number] =>
      (WEBHOOK_EVENTS as readonly unknown[]).includes(value),
    ),
  enabled: form.has('enabled'),
});

/** The new secret is shown once, right after it is made. */
const withSecret = (secret: string) => ({
  notice: 'webhookSecretShown',
  secret,
});

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    try {
      const hook = await adminFor(event).webhooks.create(input(form));
      return withSecret(hook.secret);
    } catch (caught) {
      return failFrom(caught);
    }
  },
  update: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).webhooks.update(text(form, 'id'), input(form));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'saved' };
  },
  rotate: async (event) => {
    const form = await event.request.formData();
    try {
      return withSecret(
        (await adminFor(event).webhooks.rotate(text(form, 'id'))).secret,
      );
    } catch (caught) {
      return failFrom(caught);
    }
  },
  ping: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).webhooks.ping(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'webhookPingQueued' };
  },
  remove: async (event) => {
    const form = await event.request.formData();
    try {
      await adminFor(event).webhooks.remove(text(form, 'id'));
    } catch (caught) {
      return failFrom(caught);
    }
    return { notice: 'deleted' };
  },
};
