import type { AnyExtension, JSONContent, Node } from '@tiptap/core';
import { contentExtensions } from '@cms/content';
import { adminPatternSchema, patternListSchema } from '@cms/sdk';
import type { Paginated, PatternSummary } from '@cms/sdk';
import { resolve } from '$app/paths';

/** The inserter receives metadata only; an unsynced copy is fetched on selection. */
export type PatternChoice = Pick<
  PatternSummary,
  'id' | 'title' | 'synced' | 'status'
>;

export const loadPatterns = async (
  search = '',
  page = 1,
  signal?: AbortSignal,
): Promise<Paginated<PatternChoice> | null> => {
  const query = new URLSearchParams({ search, page: String(page) });
  const response = await fetch(
    `${resolve('/admin/(app)/patterns/api')}?${query}`,
    { signal },
  ).catch(() => null);
  if (!response?.ok || response.redirected) return null;
  const parsed = patternListSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data : null;
};

/** Synced insertion needs only the id. Copies must pass the API's current draft-read guard. */
export const patternContent = async (
  pattern: PatternChoice,
): Promise<JSONContent[] | null> => {
  if (pattern.synced)
    return [{ type: 'patternRef', attrs: { ref: pattern.id } }];
  const response = await fetch(
    `${resolve('/admin/(app)/patterns/api')}?id=${encodeURIComponent(pattern.id)}`,
  ).catch(() => null);
  if (!response?.ok || response.redirected) return null;
  const parsed = adminPatternSchema
    .pick({ id: true, title: true, synced: true, status: true, document: true })
    .safeParse(await response.json().catch(() => null));
  return parsed.success
    ? ((parsed.data.document.content ?? []) as JSONContent[])
    : null;
};

/** A plugin-contributed pattern: inserted as a copy of its document, never synced. */
export interface ContributedPattern {
  id: string;
  title: string;
  /** The plugin that contributed it. */
  source: string;
  document: { content?: JSONContent[] };
}

/** Contributed patterns; an empty list when they cannot be read. */
export const loadContributedPatterns = async (): Promise<
  ContributedPattern[]
> => {
  const response = await fetch(
    `${resolve('/admin/(app)/patterns/api')}?contributions`,
  ).catch(() => null);
  if (!response?.ok || response.redirected) return [];
  const list = (await response.json().catch(() => null)) as unknown;
  return Array.isArray(list) ? (list as ContributedPattern[]) : [];
};

/** Contributed patterns whose title or plugin matches the inserter's search. */
export const matchContributed = (
  patterns: readonly ContributedPattern[],
  search: string,
) => {
  const query = search.trim().toLowerCase();
  return patterns.filter((pattern) =>
    `${pattern.title} ${pattern.source}`.toLowerCase().includes(query),
  );
};

const MARKERS = new Set(['more', 'pageBreak', 'patternRef']);

/**
 * The shared schema with labelled boxes for nodes that have no text of their own (the "more"
 * break, page breaks, synced patterns). Only their display in the editor changes.
 */
export const editorExtensions = (
  label: (type: string, ref: string | null) => string,
): AnyExtension[] =>
  contentExtensions.map((extension) =>
    MARKERS.has(extension.name)
      ? (extension as Node).extend({
          addNodeView:
            () =>
            ({ node }) => {
              const dom = document.createElement('div');
              dom.contentEditable = 'false';
              dom.className =
                'my-3 rounded-md border border-dashed px-3 py-2 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase';
              const ref =
                typeof node.attrs.ref === 'string' ? node.attrs.ref : null;
              if (ref) dom.dataset.patternRef = ref;
              dom.textContent = label(node.type.name, ref);
              return { dom };
            },
        })
      : extension,
  );
