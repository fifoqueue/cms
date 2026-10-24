import type { Highlighter, ThemedToken, TokensResult } from 'shiki';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import {
  codeBlockAttributesSchema,
  codeLanguage,
  shikiThemeId,
} from '@cms/sdk/code-block';

/**
 * Editor-only syntax colors for code blocks, as ProseMirror decorations: the text itself is
 * never touched. Shiki is imported on first use, and each grammar and theme only when a
 * block needs it; until then blocks show plain text in the automatic theme. Edits redo only
 * the blocks they touch, and wait while an input method is composing (Korean, Japanese …),
 * so the composed text is never re-wrapped mid-syllable.
 */

/** The automatic theme follows the admin color mode through `light-dark()`. */
export const AUTO_THEMES = { light: 'github-light', dark: 'github-dark' };

/**
 * Larger blocks keep their theme colors but no syntax colors while editing: ProseMirror
 * redraws every inline decoration of the edited block on each keystroke (about 170 ms for
 * the ~24,000 tokens of a 95 KB block). The public site still colors up to 100 KB.
 */
const COLOR_LIMIT = 20_000;

let highlighter: Promise<Highlighter> | null = null;
let ready: Highlighter | null = null;
const loading = new Map<string, Promise<void>>();

const load = (missing: Set<string>) => {
  highlighter ??= import('shiki').then(({ createHighlighter }) =>
    createHighlighter({ themes: [], langs: [] }),
  );
  return Promise.all(
    [...missing].map((resource) => {
      let pending = loading.get(resource);
      if (!pending) {
        const [kind, name] = resource.split(':') as [string, string];
        pending = highlighter!
          .then(async (instance) => {
            await (kind === 'theme'
              ? instance.loadTheme(name as never)
              : instance.loadLanguage(name as never));
            ready = instance;
          })
          // A grammar that fails to load leaves its blocks plain.
          .catch(() => undefined);
        loading.set(resource, pending);
      }
      return pending;
    }),
  );
};

export const codeAttributes = (raw: Record<string, unknown>) => {
  const parsed = codeBlockAttributesSchema.safeParse(raw);
  return {
    attrs: parsed.success ? parsed.data : codeBlockAttributesSchema.parse({}),
    language: parsed.success ? codeLanguage(parsed.data.language) : 'text',
  };
};

const tokenStyle = (token: ThemedToken) =>
  token.htmlStyle
    ? Object.entries(token.htmlStyle)
        .map(([key, value]) => `${key}:${value}`)
        .join(';')
    : `color:${token.color ?? 'inherit'};${(token.fontStyle ?? 0) & 1 ? 'font-style:italic;' : ''}${(token.fontStyle ?? 0) & 2 ? 'font-weight:bold;' : ''}`;

/**
 * Recent results by language, theme and text, least recently used first, bounded by the total
 * key length, so typing in a large block keeps only a few versions of it.
 */
const CACHE_LIMIT = 300_000;
const cache = new Map<string, TokensResult>();
let cached = 0;

const recall = (key: string) => {
  const result = cache.get(key);
  if (result) {
    cache.delete(key);
    cache.set(key, result);
  }
  return result;
};

const remember = (key: string, result: TokensResult) => {
  cache.set(key, result);
  cached += key.length;
  for (const oldest of cache.keys()) {
    if (cached <= CACHE_LIMIT) break;
    cache.delete(oldest);
    cached -= oldest.length;
  }
};

/** The highlighter once the grammar and themes are loaded; else they are added to `missing`. */
const highlighterFor = (
  language: string,
  theme: string | null,
  missing: Set<string>,
) => {
  const themes = theme ? [shikiThemeId(theme)] : Object.values(AUTO_THEMES);
  const needed = [
    ...(language === 'text' ? [] : [`language:${language}`]),
    ...themes.map((name) => `theme:${name}`),
  ].filter((resource) => {
    const [kind, name] = resource.split(':') as [string, string];
    const loaded =
      ready &&
      (kind === 'theme'
        ? ready.getLoadedThemes()
        : ready.getLoadedLanguages()
      ).includes(name);
    return !loaded && !loading.has(resource);
  });
  for (const resource of needed) missing.add(resource);
  return needed.length ? undefined : (ready ?? undefined);
};

/** Tokens of `code`, or undefined when highlighting fails. */
const tokenize = (
  instance: Highlighter,
  code: string,
  language: string,
  theme: string | null,
): TokensResult | undefined => {
  const key = `${language}\0${theme}\0${code}`;
  const known = recall(key);
  if (known) return known;
  let result: TokensResult;
  try {
    result = instance.codeToTokens(code, {
      lang: language as never,
      ...(theme
        ? { theme: shikiThemeId(theme) as never }
        : { themes: AUTO_THEMES as never, defaultColor: false }),
    });
  } catch {
    // A grammar or theme that is still loading or failed leaves the block plain.
    return undefined;
  }
  remember(key, result);
  return result;
};

/** Colors for one block; line numbers and highlighted rows belong to its node view. */
const blockDecorations = (
  node: Node,
  pos: number,
  missing: Set<string>,
): Decoration[] => {
  const { attrs, language } = codeAttributes(node.attrs);
  const start = pos + 1;
  const instance = highlighterFor(language, attrs.theme, missing);
  const tokens =
    instance && node.content.size <= COLOR_LIMIT
      ? tokenize(instance, node.textContent, language, attrs.theme)
      : undefined;
  const colors =
    instance && attrs.theme
      ? instance.getTheme(shikiThemeId(attrs.theme))
      : undefined;
  const decorations: Decoration[] = [
    Decoration.node(
      pos,
      pos + node.nodeSize,
      colors
        ? { style: `background:${colors.bg};color:${colors.fg}` }
        : { class: 'cms-code-auto' },
    ),
  ];
  for (const line of tokens?.tokens ?? [])
    for (const token of line) {
      if (!token.content) continue;
      decorations.push(
        Decoration.inline(
          start + token.offset,
          start + token.offset + token.content.length,
          { style: tokenStyle(token) },
        ),
      );
    }
  return decorations;
};

interface Range {
  from: number;
  to: number;
}

interface HighlightState {
  decorations: DecorationSet;
  /** Grammars and themes the latest rebuild was missing. */
  missing: Set<string>;
  /** Changed ranges still to redo once composition ends. */
  dirty: Range[];
}

const build = (doc: Node): HighlightState => {
  const missing = new Set<string>();
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    decorations.push(...blockDecorations(node, pos, missing));
    return false;
  });
  return {
    decorations: DecorationSet.create(doc, decorations),
    missing,
    dirty: [],
  };
};

/** The ranges a transaction changed, in the coordinates of its resulting document. */
const changed = (tr: Transaction): Range[] => {
  const ranges: Range[] = [];
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldFrom, _oldTo, from, to) =>
      ranges.push({ from: rest.map(from, -1), to: rest.map(to, 1) }),
    );
  });
  return ranges;
};

/**
 * Blocks longer than this keep their mapped colors while typing and are re-tokenized once
 * typing pauses: tokenizing tens of kilobytes takes too long for every keystroke.
 */
const LIVE_LIMIT = 10_000;
/** Pause after which deferred blocks (large, or edited while composing) are redone. */
const SETTLE_MS = 300;
/** `DecorationSet.remove` is quadratic in the number removed; beyond this the set is rebuilt. */
const REMOVE_LIMIT = 500;

/**
 * Redoes the textblocks around `ranges`: their mapped decorations are dropped (also for
 * blocks that stopped being code), and code blocks get fresh ones. Large code blocks are
 * left as mapped and returned as `deferred` unless `settled`.
 */
const rebuild = (
  doc: Node,
  decorations: DecorationSet,
  ranges: Range[],
  missing: Set<string>,
  settled: boolean,
) => {
  const blocks = new Set<number>();
  for (const { from, to } of ranges)
    doc.nodesBetween(
      Math.max(0, from - 1),
      Math.min(doc.content.size, to + 1),
      (node, pos) => {
        if (!node.isTextblock) return true;
        blocks.add(pos);
        return false;
      },
    );
  const spans: Range[] = [];
  const deferred: Range[] = [];
  const added: Decoration[] = [];
  for (const pos of blocks) {
    const node = doc.nodeAt(pos)!;
    const span = { from: pos, to: pos + node.nodeSize };
    if (node.type.name !== 'codeBlock') spans.push(span);
    else if (!settled && node.content.size > LIVE_LIMIT) deferred.push(span);
    else {
      spans.push(span);
      added.push(...blockDecorations(node, pos, missing));
    }
  }
  if (!spans.length) return { decorations, deferred };
  const stale = spans.flatMap(({ from, to }) =>
    decorations.find(from + 1, to - 1),
  );
  // A few stale ones are removed in place; many are cheaper to leave out of a new set.
  if (stale.length <= REMOVE_LIMIT)
    return {
      decorations: decorations.remove(stale).add(doc, added),
      deferred,
    };
  const kept = decorations
    .find()
    .filter(
      (decoration) =>
        !spans.some(
          ({ from, to }) => decoration.from >= from && decoration.to <= to,
        ),
    );
  return {
    decorations: DecorationSet.create(doc, [...kept, ...added]),
    deferred,
  };
};

const key = new PluginKey<HighlightState>('codeHighlight');
/** Meta values: grammars or themes finished loading; typing or a composition settled. */
type Meta = 'loaded' | 'flush';

export const codeHighlight = () => {
  let editorView: EditorView | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Redoes deferred blocks once edits pause and no composition is running. */
  const settle = (view: EditorView) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (view.isDestroyed || !key.getState(view.state)?.dirty.length) return;
      if (view.composing) settle(view);
      else view.dispatch(view.state.tr.setMeta(key, 'flush' satisfies Meta));
    }, SETTLE_MS);
  };
  return new Plugin<HighlightState>({
    key,
    state: {
      init: (_, state) => build(state.doc),
      apply: (tr, value) => {
        const meta = tr.getMeta(key) as Meta | undefined;
        if (meta === 'loaded' && !editorView?.composing) return build(tr.doc);
        if (!tr.docChanged && !meta) return value;
        const decorations = value.decorations.map(tr.mapping, tr.doc);
        const dirty = [
          ...value.dirty.map(({ from, to }) => ({
            from: tr.mapping.map(from, -1),
            to: tr.mapping.map(to, 1),
          })),
          ...changed(tr),
          // Loaded during a composition: everything is redone once it ends.
          ...(meta === 'loaded' ? [{ from: 0, to: tr.doc.content.size }] : []),
        ];
        if (editorView?.composing)
          return { decorations, missing: new Set(), dirty };
        const missing = new Set<string>();
        const next = rebuild(
          tr.doc,
          decorations,
          dirty,
          missing,
          meta === 'flush',
        );
        return {
          decorations: next.decorations,
          missing,
          dirty: next.deferred,
        };
      },
    },
    props: {
      decorations: (state) => key.getState(state)?.decorations,
      handleDOMEvents: {
        // Composition may end without another change; redo what it left behind.
        compositionend: (view) => {
          settle(view);
          return false;
        },
      },
    },
    view: (view) => {
      editorView = view;
      let requested: Set<string> | undefined;
      const request = () => {
        const missing = key.getState(view.state)?.missing;
        if (!missing?.size || missing === requested) return;
        requested = missing;
        void load(missing).then(() => {
          if (!view.isDestroyed)
            view.dispatch(view.state.tr.setMeta(key, 'loaded' satisfies Meta));
        });
      };
      request();
      return {
        update: () => {
          request();
          if (key.getState(view.state)?.dirty.length) settle(view);
        },
        destroy: () => {
          clearTimeout(timer);
          editorView = null;
        },
      };
    },
  });
};
