import type {
  CommentCheck,
  CommentChecker,
  CommentCheckerRegistrar,
  CommentVerdict,
} from '@cms/sdk/plugin';
import { z } from 'zod';
import { isolate } from '#api/shared/isolate';

const verdictSchema = z.object({
  status: z.enum(['approve', 'hold', 'spam']),
  reasons: z.array(z.string().max(500)).max(50),
});
const rank = { approve: 0, hold: 1, spam: 2 };

export const coreCommentChecker: CommentChecker = {
  check({ comment, settings, known, moderator }) {
    if (moderator) return { status: 'approve', reasons: [] };
    const text = [
      comment.authorName,
      comment.authorEmail,
      comment.authorUrl,
      comment.body,
    ]
      .join('\n')
      .toLowerCase();
    if (settings.blockWords.some((word) => text.includes(word)))
      return { status: 'spam', reasons: ['blocklist'] };
    if (
      settings.holdWords.some((word) => text.includes(word)) ||
      (comment.body.match(/https?:\/\//gi) ?? []).length > settings.maxLinks
    )
      return { status: 'hold', reasons: ['moderation-rule'] };
    return {
      status:
        settings.moderation === 'auto' ||
        (settings.moderation === 'known' && known)
          ? 'approve'
          : 'hold',
      reasons: [],
    };
  },
};

/**
 * All checkers use the same contract. The strictest valid verdict wins.
 * Core checkers run directly and their errors fail the check; plugin checkers are isolated and ignored on failure.
 */
export class CommentCheckers implements CommentCheckerRegistrar {
  private readonly entries = new Map<
    object,
    { check: CommentChecker['check']; core: boolean }
  >();
  constructor(private readonly timeoutMs = 3000) {
    this.registerCore(coreCommentChecker);
  }
  register(checker: CommentChecker) {
    return this.add(checker, false);
  }
  /** Composition-root only: plugin contexts expose `register`. */
  registerCore(checker: CommentChecker) {
    return this.add(checker, true);
  }
  private add(checker: CommentChecker, core: boolean) {
    const token = {};
    this.entries.set(token, { check: checker.check.bind(checker), core });
    return () => {
      this.entries.delete(token);
    };
  }
  async check(input: CommentCheck): Promise<CommentVerdict> {
    const combined: CommentVerdict = { status: 'approve', reasons: [] };
    for (const [token, entry] of [...this.entries]) {
      if (!this.entries.has(token)) continue;
      let verdict: CommentVerdict;
      if (entry.core)
        verdict = verdictSchema.parse(
          await entry.check(structuredClone(input)),
        );
      else {
        const result = await isolate(
          () => entry.check(structuredClone(input)),
          this.timeoutMs,
        );
        if (!result.ok || !this.entries.has(token)) continue;
        const parsed = verdictSchema.safeParse(result.value);
        if (!parsed.success) continue;
        verdict = parsed.data;
      }
      if (rank[verdict.status] > rank[combined.status])
        combined.status = verdict.status;
      combined.reasons.push(...verdict.reasons);
    }
    return combined;
  }
}
