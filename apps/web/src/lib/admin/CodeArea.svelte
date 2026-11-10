<script module lang="ts">
  import type { Highlighter, ThemedToken } from 'shiki';

  const THEMES = { light: 'github-light', dark: 'github-dark' };

  /** Longer sources stay plain: tokenizing runs on every keystroke. */
  const COLOR_LIMIT = 50_000;

  let highlighter: Promise<Highlighter | null> | undefined;

  /** Shiki with the TypeScript grammar, loaded once on first use; null when loading fails. */
  const loadHighlighter = () =>
    (highlighter ??= import('shiki')
      .then(({ createHighlighter }) =>
        createHighlighter({
          themes: Object.values(THEMES),
          langs: ['typescript'],
        }),
      )
      .catch(() => null));

  const escape = (text: string) =>
    text.replace(/[&<>]/g, (char) => `&#${char.charCodeAt(0)};`);

  /** Theme colors as `--shiki-light`/`--shiki-dark`; text is escaped, one source line per row. */
  const render = (lines: ThemedToken[][]) =>
    lines
      .map((line) =>
        line
          .map(
            (token) =>
              `<span style="${Object.entries(token.htmlStyle ?? {})
                .map(([key, value]) => `${key}:${value}`)
                .join(';')}">${escape(token.content)}</span>`,
          )
          .join(''),
      )
      .join('\n') + '\n';
</script>

<script lang="ts">
  /**
   * A TypeScript text area with line numbers. Syntax colors are drawn behind the transparent
   * text of a plain `<textarea>`, so the form submits and edits exactly as without them.
   */
  let {
    value = $bindable(''),
    name,
    label,
    invalid = false,
    describedby,
  }: {
    value?: string;
    name: string;
    label: string;
    invalid?: boolean;
    describedby?: string;
  } = $props();

  let instance = $state.raw<Highlighter | null>(null);
  let gutter = $state<HTMLElement>();
  let view = $state<HTMLElement>();

  $effect(() => {
    void loadHighlighter().then((loaded) => (instance = loaded));
  });

  const lines = $derived(value.split('\n').length);
  const html = $derived.by(() => {
    if (!instance || value.length > COLOR_LIMIT) return null;

    try {
      return render(
        instance.codeToTokens(value, {
          lang: 'typescript',
          themes: THEMES,
          defaultColor: false,
        }).tokens,
      );
    } catch {
      return null;
    }
  });
</script>

<div
  class="flex max-h-[70vh] min-h-80 overflow-hidden rounded-md border font-mono text-xs leading-5"
>
  <div
    bind:this={gutter}
    aria-hidden="true"
    class="shrink-0 overflow-hidden border-r bg-muted/50 px-2 py-2 text-right text-muted-foreground select-none"
  >
    {#each { length: lines }, index (index)}
      <div>{index + 1}</div>
    {/each}
  </div>
  <div class="relative min-w-0 flex-1">
    {#if html}
      <!-- eslint-disable svelte/no-at-html-tags -- token text is escaped by `render` -->
      <pre
        bind:this={view}
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 m-0 overflow-hidden px-3 py-2 whitespace-pre [&_span]:text-(--shiki-light) dark:[&_span]:text-(--shiki-dark)">{@html html}</pre>
      <!-- eslint-enable svelte/no-at-html-tags -->
    {/if}
    <textarea
      {name}
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedby}
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      wrap="off"
      bind:value
      onscroll={(event) => {
        const { scrollTop, scrollLeft } = event.currentTarget;

        if (gutter) gutter.scrollTop = scrollTop;

        if (view) {
          view.scrollTop = scrollTop;
          view.scrollLeft = scrollLeft;
        }
      }}
      class={[
        'absolute inset-0 size-full resize-none overflow-auto bg-transparent px-3 py-2 outline-none',
        html && 'text-transparent caret-foreground',
      ]}></textarea>
  </div>
</div>
