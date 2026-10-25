/** The comment a reply answers. */
export interface ReplyTarget {
  id: string;
  name: string;
}

/** Where the reply form goes: under `host` (a comment id), or above the main form when null. */
export interface ReplyPlacement {
  target: ReplyTarget;
  host: string | null;
}

/** The address parameter of the reply link, for visitors without scripts. */
export const REPLY_PARAM = 'replytocom';

/**
 * The reply form's target and position in `thread`. A reply chosen on this page wins (`null`:
 * cancelled, `undefined`: none chosen), then the context of a refused reply, then the
 * `?replytocom=` link. A linked comment must be on this page and open to replies; a refused
 * reply keeps its context, below its comment when that comment can still be answered here.
 */
export const placeReply = <Comment extends { id: string; authorName: string }>(
  thread: readonly Comment[],
  replyable: (comment: Comment) => boolean,
  chosen: ReplyTarget | null | undefined,
  refused: ReplyTarget | null,
  requested: string | null,
): ReplyPlacement | null => {
  const host = (id: string) => {
    const comment = thread.find((item) => item.id === id);
    return comment && replyable(comment) ? comment : null;
  };
  const target = chosen === undefined ? refused : chosen;
  if (target) return { target, host: host(target.id)?.id ?? null };
  if (chosen === null || !requested) return null;
  const linked = host(requested);
  return linked
    ? { target: { id: linked.id, name: linked.authorName }, host: linked.id }
    : null;
};

/**
 * Brings the moved reply form into view and puts the cursor in its comment field; the scroll is
 * instant for visitors who prefer reduced motion.
 */
export const revealReply = (form: HTMLElement) => {
  const view = form.ownerDocument.defaultView;
  const reduced = view?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  form.querySelector<HTMLTextAreaElement>('textarea')?.focus({
    preventScroll: true,
  });
  form.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: 'nearest',
  });
};
