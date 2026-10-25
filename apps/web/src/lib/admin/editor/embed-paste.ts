import { safeHttpsUrl } from '@cms/content/urls';
import { MAX_EMBED_URL_LENGTH } from '@cms/sdk';
import type { EmbedMatcher } from '@cms/sdk/embed-pattern';
import { closeHistory } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** An enabled embed provider; `urlPattern` is a regex source matched against a URL's `href`. */
export interface EmbedProviderInfo {
  id: string;
  label: string;
  urlPattern: string;
}

let loading: Promise<EmbedProviderInfo[]> | null = null;

/** Share only an in-flight read; a failed read means no auto-embed. */
export const loadEmbedProviders = () =>
  (loading ??= fetch('/admin/content/embed-providers')
    .then((response) =>
      response.ok ? (response.json() as Promise<EmbedProviderInfo[]>) : [],
    )
    .catch(() => [])
    .finally(() => {
      loading = null;
    }));

/** The providers' patterns; one that does not compile is skipped. */
export const embedMatchers = async (providers: EmbedProviderInfo[]) => {
  const { compileEmbedPattern } = await import('@cms/sdk/embed-pattern');
  return providers.flatMap((provider) => {
    const matcher = compileEmbedPattern(provider.urlPattern);
    return matcher ? [matcher] : [];
  });
};

/** Pasted text that is a single `https:` URL some provider matches, as its `href`; else null. */
export const embedPasteUrl = (
  text: string,
  matchers: Pick<EmbedMatcher, 'test'>[],
) => {
  const trimmed = text.trim();
  if (
    trimmed.length > MAX_EMBED_URL_LENGTH ||
    !/^https:\/\/\S+$/i.test(trimmed)
  )
    return null;
  const href = safeHttpsUrl(trimmed);
  return href &&
    href.length <= MAX_EMBED_URL_LENGTH &&
    matchers.some((pattern) => pattern.test(href))
    ? href
    : null;
};

/**
 * Where a paste of `url` becomes an embed: the empty paragraph holding a collapsed caret,
 * outside table cells, where an embed may stand. Null keeps the normal paste.
 */
export const embedPasteTarget = (state: EditorState) => {
  const { selection } = state;
  const { $from } = selection;
  const embed = state.schema.nodes.embed;
  if (
    !embed ||
    !selection.empty ||
    $from.depth === 0 ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parent.content.size > 0
  )
    return null;
  for (let depth = $from.depth - 1; depth > 0; depth--)
    if (['tableCell', 'tableHeader'].includes($from.node(depth).type.name))
      return null;
  const index = $from.index($from.depth - 1);
  if (!$from.node($from.depth - 1).canReplaceWith(index, index + 1, embed))
    return null;
  return { from: $from.before(), to: $from.after() };
};

/**
 * Pastes `text` as an embed when it is a provider URL pasted into an empty paragraph: first
 * the plain link, then, as its own undo step, the embed with a paragraph to keep writing in.
 * Returns whether it handled the paste.
 */
export const pasteEmbed = (
  view: EditorView,
  text: string,
  matchers: Pick<EmbedMatcher, 'test'>[],
) => {
  const url = embedPasteUrl(text, matchers);
  const target = url && embedPasteTarget(view.state);
  if (!url || !target) return false;
  const { schema } = view.state;
  const link = schema.marks.link?.create({ href: url });
  view.dispatch(
    view.state.tr
      .replaceSelectionWith(schema.text(url, link ? [link] : []), false)
      .setMeta('paste', true)
      .setMeta('uiEvent', 'paste')
      .scrollIntoView(),
  );
  const { $from } = view.state.selection;
  const from = $from.before();
  const embed = schema.nodes.embed!.create({ url });
  const tr = view.state.tr.replaceWith(from, $from.after(), [
    embed,
    schema.nodes.paragraph!.create(),
  ]);
  view.dispatch(
    closeHistory(tr)
      .setSelection(TextSelection.create(tr.doc, from + embed.nodeSize + 1))
      .scrollIntoView(),
  );
  return true;
};
