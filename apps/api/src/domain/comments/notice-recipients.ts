import type { CommentNoticeRecipients } from '@cms/sdk/plugin';
import { z } from 'zod';
import type { HookDispatcher } from '#api/domain/ports';

/** Recipients a result may list; more when core itself mails more (one per moderator). */
const RECIPIENTS_MAX = 100;

/**
 * Who is mailed about a comment after `comment.notificationRecipients`. Core's list is the
 * initial value. Handlers may drop any address and add the address of an existing user account (looked
 * up in `users`, case-insensitively) other than the `blocked` ones; any other address
 * invalidates the result. Returns core's addresses still listed and the users added, each once,
 * in the handlers' order. Without handlers nothing runs; `users` and `blocked` are read only
 * when a result adds an address.
 */
export const noticeRecipients = async <U extends { email: string }>(
  hooks: HookDispatcher,
  notice: CommentNoticeRecipients,
  users: () => Promise<readonly U[]>,
  blocked: () => Promise<readonly string[]> = async () => [],
): Promise<{ kept: string[]; added: U[] }> => {
  if (!hooks.has('comment.notificationRecipients'))
    return { kept: notice.to, added: [] };
  const core = new Map(notice.to.map((to) => [to.toLowerCase(), to]));
  let accounts: Promise<Map<string, U>> | undefined;
  const lookup = () =>
    (accounts ??= users().then(
      (list) => new Map(list.map((user) => [user.email.toLowerCase(), user])),
    ));
  let barred: Promise<Set<string>> | undefined;
  const refused = () =>
    (barred ??= blocked().then(
      (list) => new Set(list.map((to) => to.toLowerCase())),
    ));
  const schema = z.strictObject({
    commentId: z.literal(notice.commentId),
    kind: z.literal(notice.kind),
    to: z
      .array(z.string().max(254))
      .max(Math.max(RECIPIENTS_MAX, notice.to.length)),
  });
  const { to } = await hooks.applyFilter(
    'comment.notificationRecipients',
    { ...notice, to: [...notice.to] },
    async (value) => {
      const result = schema.safeParse(value);
      if (!result.success) return false;
      const added = result.data.to
        .map((address) => address.toLowerCase())
        .filter((address) => !core.has(address));
      if (!added.length) return true;
      const [known, refusedAddresses] = await Promise.all([
        lookup(),
        refused(),
      ]);
      return added.every(
        (address) => known.has(address) && !refusedAddresses.has(address),
      );
    },
  );
  const seen = new Set<string>();
  const kept: string[] = [];
  const added: U[] = [];
  for (const address of to) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const listed = core.get(key);
    if (listed !== undefined) kept.push(listed);
    else {
      const user = (await lookup()).get(key);
      if (user) added.push(user);
    }
  }
  return { kept, added };
};
