import { contentApi } from '#lib/server/api.js';
import { failFrom, text } from '#lib/server/errors.js';
import { visitorOf } from '#lib/server/visitor.js';
import type { Actions, PageServerLoad } from './$types';

const PRIVATE = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
  // The token must not leak to other sites through links on this page.
  'referrer-policy': 'no-referrer',
};

/**
 * The link from a notification email or push. Opening it changes nothing (mail scanners follow
 * links); the visitor confirms with a button that posts the token.
 */
export const load: PageServerLoad = ({ url, setHeaders }) => {
  setHeaders(PRIVATE);
  return {
    kind: 'unsubscribe' as const,
    token: (url.searchParams.get('token') ?? '').slice(0, 1024),
  };
};

export const actions: Actions = {
  // The page load that renders the result sets the same headers.
  default: async (event) => {
    const form = await event.request.formData();
    try {
      const { channel } = await contentApi(event.fetch).comments.unsubscribe(
        text(form, 'token'),
        visitorOf(event, form),
      );
      return { channel };
    } catch (caught) {
      return failFrom(caught);
    }
  },
};
