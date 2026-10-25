import {
  DEFAULT_PERMALINK_SETTINGS,
  contentTypeKeySchema,
  permalinkPathIssue,
  permalinkPathSchema,
  permalinkPatternSchema,
  renderPermalink,
} from '@cms/sdk';
import type { PermalinkSettings } from '@cms/sdk';
import { permalinkPatternFor } from '@cms/sdk';
import { invalidInput, Errors, withParams } from '#api/shared/errors';

/** The content fields a permalink is built from. */
export interface PermalinkSubject {
  timeZone?: string;
  parentId?: string | null;
  parents?: readonly string[];
  author?: string;
  category?: readonly string[];
  id: string;
  type: string;
  slug: string;
  title: string;
  /**
   * First publication, kept when content is unpublished; `null` until then, when `createdAt`
   * dates the path. Set means the content was public, so its old paths stay as redirects.
   */
  publishedAt: Date | null;
  createdAt: Date;
}

/**
 * Stored settings, re-validated per content type: a missing or invalid template falls back to
 * the default, so a type added later keeps `/%slug%` and a damaged value never breaks writes.
 */
export const readPermalinkSettings = (stored: unknown): PermalinkSettings => {
  const record =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)
      : {};
  const settings: PermalinkSettings = { ...DEFAULT_PERMALINK_SETTINGS };

  for (const [type, value] of Object.entries(record)) {
    const result = permalinkPatternSchema.safeParse(value);

    if (result.success && contentTypeKeySchema.safeParse(type).success)
      settings[type] = result.data;
  }

  return settings;
};

/**
 * The canonical path of `subject` under `settings`. Throws `invalid_input` when the content's
 * values cannot form a usable path (reserved, too long, a `.`/`..` segment, an unencodable title).
 * Keeping `current` unchanged needs a valid structure only, so legacy paths inside a reserved
 * namespace (such as `/api` from before reservations) stay saveable; new claims are checked fully.
 */
export const contentPath = (
  settings: PermalinkSettings,
  subject: PermalinkSubject,
  current: string | null = null,
  expanded?: string,
): string => {
  let path: string;

  try {
    path =
      expanded ??
      renderPermalink(permalinkPatternFor(settings, subject.type), {
        timeZone: subject.timeZone,
        author: subject.author,
        category: subject.category,
        parents: subject.parents,
        id: subject.id,
        slug: subject.slug,
        title: subject.title,
        publishedAt: subject.publishedAt?.toISOString() ?? null,
        createdAt: subject.createdAt.toISOString(),
      });
  } catch {
    throw invalidInput(
      Errors.InvalidPermalink,
      withParams(
        Errors.PermalinkTitleUnusable,
        { title: subject.title },
        'path',
      ),
    );
  }

  const issue =
    path === current
      ? permalinkPathSchema.safeParse(path).error?.issues[0]?.message
      : permalinkPathIssue(path);

  if (issue)
    throw invalidInput(
      Errors.InvalidPermalink,
      withParams(
        Errors.PermalinkPathInvalid,
        { reason: issue, path, title: subject.title },
        'path',
      ),
    );

  return path;
};
