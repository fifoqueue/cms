import { AVATAR_DEFAULTS, COMMENT_MODERATION } from '@cms/sdk';
import type { DiscussionSettingsInput } from '@cms/sdk';
import { text } from '#lib/server/errors.js';
import { submitAction } from '#lib/server/form-action.js';
import { adminFor } from '#lib/server/session.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
  discussion: await adminFor(event).discussion.get(),
});

const number = (form: FormData, key: string) =>
  Math.trunc(Number(text(form, key)));

/** One entry per non-empty line. */
const lines = (form: FormData, key: string) =>
  text(form, key)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();
    const moderation = text(form, 'moderation');
    const input: DiscussionSettingsInput = {
      enabled: form.has('enabled'),
      requireLogin: form.has('requireLogin'),
      showName: form.has('showName'),
      showEmail: form.has('showEmail'),
      showWebsite: form.has('showWebsite'),
      defaultName: text(form, 'defaultName'),
      showAvatars: form.has('showAvatars'),
      avatarDefault:
        AVATAR_DEFAULTS.find(
          (value) => value === text(form, 'avatarDefault'),
        ) ?? 'mp',
      moderation: (COMMENT_MODERATION as readonly string[]).includes(moderation)
        ? (moderation as DiscussionSettingsInput['moderation'])
        : 'known',
      closeAfterDays: number(form, 'closeAfterDays'),
      threadDepth: number(form, 'threadDepth'),
      pageSize: number(form, 'pageSize'),
      maxLinks: number(form, 'maxLinks'),
      holdWords: lines(form, 'holdWords'),
      blockWords: lines(form, 'blockWords'),
      notifyModerators: form.has('notifyModerators'),
      notifyAuthors: form.has('notifyAuthors'),
    };
    return submitAction(() => adminFor(event).discussion.update(input));
  },
};
