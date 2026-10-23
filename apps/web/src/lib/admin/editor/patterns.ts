import type { AnyExtension, JSONContent, Node } from '@tiptap/core';
import { contentExtensions } from '@cms/content';
import type { AdminPattern } from '@cms/sdk';

/** What the editor needs of a pattern. */
export type PatternChoice = Pick<
  AdminPattern,
  'id' | 'title' | 'synced' | 'document' | 'status'
>;

/** The library of patterns for the inserter; empty when it cannot be read. */
export const loadPatterns = async (): Promise<PatternChoice[]> => {
  const response = await fetch('/admin/patterns/api').catch(() => null);
  if (!response?.ok || response.redirected) return [];
  return ((await response.json()) as PatternChoice[]) ?? [];
};

/** A synced pattern goes in by reference; others are copied in as their blocks. */
export const patternContent = (pattern: PatternChoice): JSONContent[] =>
  pattern.synced
    ? [{ type: 'patternRef', attrs: { ref: pattern.id } }]
    : ((pattern.document.content ?? []) as JSONContent[]);

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
