import { catalogMessage } from '#lib/admin/form-errors.js';
import type { Messages } from '#lib/i18n/messages.js';

/**
 * The title and hint of an error screen, by status. Only catalog messages are shown: unexpected
 * errors carry SvelteKit's generic text, which says nothing to a visitor. `search`: the screen
 * offers a search box (theme templates), so a missing page suggests searching.
 */
export const errorCopy = (
  m: Messages,
  status: number,
  message: string,
  search = false,
) => {
  const known = catalogMessage(m, message);
  if (status === 404)
    return {
      title: m.themeNotFound,
      help: search ? m.themeNotFoundHelp : m.errorPageNotFoundHelp,
    };
  if (status === 401 || status === 403)
    return {
      title: m.errorPageForbidden,
      help: known ?? m.errorPageForbiddenHelp,
    };
  if (status >= 500)
    return { title: m.errorPageServer, help: m.errorPageServerHelp };
  return { title: m.errorPageOther, help: known ?? '' };
};
