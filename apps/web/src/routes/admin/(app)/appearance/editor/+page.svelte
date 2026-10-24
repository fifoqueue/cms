<script lang="ts">
  import '#lib/theme/site.css';
  import TemplateView from '#lib/theme/TemplateView.svelte';
  import ThemeStylesheet from '#lib/theme/ThemeStylesheet.svelte';
  import { themeStyle } from '#lib/theme/style.js';
  import { provideDateStyle } from '#lib/theme/format.js';
  import { queryKey, selectionOf } from '#lib/theme/queries.js';
  import { untrack } from 'svelte';
  import type { Block } from '@cms/sdk';
  import { resolve } from '$app/paths';
  import { deserialize, enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import {
    THEME_FONT_SIZES,
    THEME_LINE_HEIGHTS,
    THEME_RADII,
    isIndependentQuery,
    walkBlocks,
  } from '@cms/sdk';
  import {
    Redo2,
    Undo2,
    ExternalLink,
    LayoutTemplate,
    Palette,
    Puzzle,
  } from '@lucide/svelte';
  import BlockTreeEditor from '#lib/admin/BlockTreeEditor.svelte';
  import { History, historyKey } from '#lib/admin/history.js';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { confirmLeave } from '#lib/admin/unsaved.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  // The canvases show dates the way the public site does (Settings → Reading).
  provideDateStyle(() => ({
    locale: data.canvas.site.locale,
    dateFormat: data.canvas.reading.dateFormat,
    timeZone: data.canvas.reading.timeZone,
  }));

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const editor = $derived(data.editor);

  const selected = $derived.by(() => {
    const [kind, key] = data.edit.split(':') as [string, string | undefined];
    if (kind === 'styles') return { kind: 'styles' as const };
    if (kind === 'part') {
      const part = editor.parts.find((entry) => entry.slug === key);
      if (part) return { kind: 'part' as const, part };
    }
    const template =
      editor.templates.find((entry) => entry.name === key) ??
      editor.templates.find((entry) => entry.name === 'index');
    return template
      ? { kind: 'template' as const, template }
      : { kind: 'styles' as const };
  });

  const link = (edit: string) =>
    `?theme=${encodeURIComponent(editor.id)}&edit=${encodeURIComponent(edit)}`;

  const colors = $derived(
    editor.settings.palette.map(({ slug, name }) => ({ slug, name })),
  );
  const parts = $derived(editor.parts.map((part) => part.slug));
  let dirty = $state(false);
  let stylesDirty = $state(false);
  confirmLeave(
    () => dirty || stylesDirty,
    () => m.unsavedLeave,
  );
  let canvasBlocks = $state<Block[] | undefined>();
  type CanvasData = Pick<
    typeof data.canvas,
    | 'queries'
    | 'terms'
    | 'months'
    | 'adjacent'
    | 'pageTree'
    | 'recentComments'
    | 'authors'
    | 'calendar'
  >;
  let canvasData = $state<CanvasData | undefined>();
  let previewError = $state<{ message?: string } | undefined>();
  let mobile = $state(false);
  /** Path key of the block selected in the editor; only digits and dots. */
  let selectedBlock = $state<string | null>(null);

  const DATA_BLOCKS = new Set<string>([
    'categories',
    'tag-cloud',
    'post-navigation',
    'page-list',
    'post-author',
    'calendar',
  ]);
  /** Changes whenever the data the edited blocks show changes (lists, terms, months, neighbours). */
  const dataSignature = $derived(
    JSON.stringify(
      [...walkBlocks(canvasBlocks ?? [])].flatMap((block) =>
        isIndependentQuery(block)
          ? [
              queryKey(
                selectionOf(
                  block as Extract<Block, { name: 'query' | 'latest-posts' }>,
                ),
              ),
            ]
          : block.name === 'archives'
            ? [`archives:${block.attrs.months}`]
            : block.name === 'latest-comments'
              ? [`comments:${block.attrs.comments}`]
              : DATA_BLOCKS.has(block.name)
                ? [block.name]
                : [],
      ),
    ),
  );

  $effect(() => {
    canvasBlocks =
      selected.kind === 'template'
        ? selected.template.blocks
        : selected.kind === 'part'
          ? selected.part.blocks
          : undefined;
    canvasData = undefined;
    previewError = undefined;
    dirty = false;
    stylesDirty = false;
    stylesDraft = null;
  });

  // Global Styles: the unsaved form drives the preview below it and its own undo history.
  let stylesForm = $state<HTMLFormElement>();
  let stylesDraft = $state<string | null>(null);
  let stylesHistory: History | null = null;
  let stylesSteps = $state(0);
  const readStyles = (form: HTMLFormElement) =>
    JSON.stringify(
      Object.fromEntries(
        [...new FormData(form)].filter(
          ([, value]) => typeof value === 'string',
        ),
      ),
    );
  $effect(() => {
    if (stylesForm) stylesHistory = new History(readStyles(stylesForm));
  });
  const styleChanged = () => {
    if (!stylesForm) return;
    stylesDirty = true;
    stylesDraft = readStyles(stylesForm);
    stylesHistory?.record(stylesDraft);
    stylesSteps++;
  };
  const styleStep = (direction: 'undo' | 'redo') => {
    const snapshot =
      direction === 'undo' ? stylesHistory?.undo() : stylesHistory?.redo();
    if (!snapshot || !stylesForm) return;
    for (const [name, value] of Object.entries(
      JSON.parse(snapshot) as Record<string, string>,
    )) {
      const control = stylesForm.elements.namedItem(name);
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement
      )
        control.value = value;
    }
    stylesDraft = snapshot;
    stylesDirty = true;
    stylesSteps++;
  };
  const stylesCan = $derived.by(() => {
    void stylesSteps;
    return {
      undo: stylesHistory?.canUndo ?? false,
      redo: stylesHistory?.canRedo ?? false,
    };
  });
  const HEX = /^#[0-9a-f]{6}$/i;
  /** The canvas theme with the unsaved colors and styles; values outside the choices are ignored. */
  const styledTheme = $derived.by(() => {
    const theme = data.canvas.theme;
    if (!stylesDraft) return theme;
    const values = JSON.parse(stylesDraft) as Record<string, string>;
    const fonts = theme.settings.fontFamilies.map((font) => font.slug);
    const pick = <T extends string>(
      options: readonly T[],
      value: string | undefined,
      fallback: T,
    ) => (options.includes(value as T) ? (value as T) : fallback);
    return {
      ...theme,
      settings: {
        ...theme.settings,
        palette: theme.settings.palette.map((entry) => {
          const color = values[`color.${entry.slug}`];
          return color && HEX.test(color) ? { ...entry, color } : entry;
        }),
      },
      styles: {
        ...theme.styles,
        fontFamily: pick(fonts, values.fontFamily, theme.styles.fontFamily),
        headingFontFamily: pick(
          ['', ...fonts],
          values.headingFontFamily,
          theme.styles.headingFontFamily,
        ),
        fontSize: pick(
          THEME_FONT_SIZES,
          values.fontSize,
          theme.styles.fontSize,
        ),
        lineHeight: pick(
          THEME_LINE_HEIGHTS,
          values.lineHeight,
          theme.styles.lineHeight,
        ),
        radius: pick(THEME_RADII, values.radius, theme.styles.radius),
      },
    };
  });

  $effect(() => {
    const signature = dataSignature;
    const theme = editor.id;
    const selection = selected;
    const blocks = untrack(() => canvasBlocks);
    if (!blocks || selection.kind === 'styles' || signature === '[]') return;

    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(async () => {
      const body = new FormData();
      body.set('theme', theme);
      body.set('kind', selection.kind);
      body.set(
        'key',
        selection.kind === 'template'
          ? selection.template.name
          : selection.part.slug,
      );
      body.set('blocks', JSON.stringify(blocks));
      // The published sample entry, for its previous and next entries.
      if (data.previewPage?.kind === 'content') {
        body.set('contentId', data.previewPage.content.id);
        body.set('author', data.previewPage.content.author?.slug ?? '');
      }

      try {
        const response = await fetch('?/preview', {
          method: 'POST',
          body,
          signal: controller.signal,
          headers: { 'x-sveltekit-action': 'true' },
        });
        const result = deserialize<CanvasData, { message?: string }>(
          await response.text(),
        );
        if (!current) return;
        if (result.type === 'success') {
          canvasData = result.data;
          previewError = undefined;
        } else if (result.type === 'failure') {
          previewError = result.data;
        }
      } catch {
        // Keep the last successful preview when the request is interrupted or offline.
      }
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  });

  const confirmReset: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.editorResetConfirm)) cancel();
  };
  /** Keep the editor's own tree after saving instead of reloading it from the server. */
  const keep: SubmitFunction =
    () =>
    async ({ update }) => {
      await update({ reset: false });
    };

  const navItem =
    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium';
</script>

<!-- Templates and parts handle the keys in BlockTreeEditor; Global Styles here. -->
<svelte:window
  onkeydown={(event) => {
    if (selected.kind !== 'styles') return;
    const direction = historyKey(event);
    if (!direction) return;
    event.preventDefault();
    styleStep(direction);
  }}
/>

<svelte:head>
  <title>{m.navEditor} · {editor.name}</title>
  {#if selectedBlock}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- the key is a block path of digits and dots -->
    {@html `<style>.cms-editor-canvas [data-block-path="${selectedBlock.replace(/[^\d.]/g, '')}"] > * { outline: 2px solid #3b82f6; outline-offset: 2px; }</style>`}
  {/if}
</svelte:head>
<!-- The edited theme's stylesheet, so both canvases match the public site. -->
<ThemeStylesheet css={data.canvas.theme.css} />

<div class="flex flex-wrap items-center justify-between gap-4">
  <div class="space-y-1">
    <h1 class="text-2xl font-semibold">{m.navEditor}</h1>
    <p class="max-w-2xl text-sm text-muted-foreground">{m.editorIntro}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <form method="GET" class="flex items-center gap-2">
      <Label for="editor-theme" class="sr-only">{m.editorTheme}</Label>
      <NativeSelect
        id="editor-theme"
        name="theme"
        value={editor.id}
        onchange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {#each data.themes as theme (theme.id)}
          <NativeSelectOption value={theme.id}
            >{theme.name}{theme.active
              ? ` (${m.themeActive})`
              : ''}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
      <noscript
        ><Button type="submit" variant="outline">{m.editorTheme}</Button
        ></noscript
      >
    </form>
    <Button href={resolve('/(site)')} variant="outline" target="_blank"
      ><ExternalLink class="size-4" /> {m.viewSite}</Button
    >
  </div>
</div>
<FormMessage {form} />

<div class="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
  <!-- The padding inside the scroller keeps the items' focus outlines visible. -->
  <nav
    aria-label={m.navEditor}
    class="space-y-5 xl:sticky xl:top-4 xl:-m-1 xl:max-h-[calc(100dvh-2rem)] xl:self-start xl:overflow-y-auto xl:p-1"
  >
    <div class="space-y-1">
      <!-- eslint-disable svelte/no-navigation-without-resolve -- query strings on this page -->
      <a
        href={link('styles')}
        aria-current={selected.kind === 'styles' ? 'page' : undefined}
        class={navItem}><Palette class="size-4" /> {m.editorStyles}</a
      >
    </div>
    <div class="space-y-1">
      <h2
        class="px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {m.editorTemplates}
      </h2>
      {#each editor.templates as template (template.name)}
        <a
          href={link(`template:${template.name}`)}
          aria-current={selected.kind === 'template' &&
          selected.template.name === template.name
            ? 'page'
            : undefined}
          class={navItem}
        >
          <LayoutTemplate class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate"
            >{m.templateLabel(template.name)}</span
          >
          {#if !template.inTheme}<Badge variant="secondary"
              >{m.editorAdded}</Badge
            >
          {:else if template.customized}<Badge variant="outline"
              >{m.editorCustomized}</Badge
            >{/if}
        </a>
      {/each}
      <form method="POST" action="?/addTemplate" class="space-y-2 px-1 pt-2">
        <input type="hidden" name="theme" value={editor.id} />
        <NativeSelect
          name="kind"
          class="w-full"
          size="sm"
          aria-label={m.editorTemplateKind}
        >
          {#each data.kinds as kind (kind)}
            <NativeSelectOption value={kind}
              >{m.templateLabel(kind)}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
        <Input
          name="slug"
          placeholder={m.editorTemplateSlug}
          aria-label={m.editorTemplateSlug}
          pattern={'[\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M}]*(-[\\p{L}\\p{N}][\\p{L}\\p{N}\\p{M}]*)*'}
          class="h-8"
        />
        <Button type="submit" variant="outline" size="sm" class="w-full"
          >{m.editorAddTemplate}</Button
        >
      </form>
    </div>
    <div class="space-y-1">
      <h2
        class="px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {m.editorParts}
      </h2>
      <form method="POST" action="?/addPart" class="space-y-2 px-1 pb-3">
        <input type="hidden" name="theme" value={editor.id} />
        <Label for="pattern-slug">{m.editorPatternName}</Label>
        <Input
          id="pattern-slug"
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxlength={64}
        />
        <Button type="submit" variant="outline" size="sm"
          >{m.editorAddPattern}</Button
        >
        <p class="text-xs text-muted-foreground">{m.editorPatternHelp}</p>
      </form>
      {#each editor.parts as part (part.slug)}
        <a
          href={link(`part:${part.slug}`)}
          aria-current={selected.kind === 'part' &&
          selected.part.slug === part.slug
            ? 'page'
            : undefined}
          class={navItem}
        >
          <Puzzle class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{part.title}</span>
          {#if part.customized}<Badge variant="outline"
              >{m.editorCustomized}</Badge
            >{/if}
        </a>
      {/each}
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    </div>
  </nav>

  <div class="min-w-0">
    {#if selected.kind === 'styles'}
      {@const styles = editor.styles.current}
      <Card>
        <CardHeader>
          <CardTitle>{m.editorStyles}</CardTitle>
          <CardDescription>{editor.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            method="POST"
            action="?/saveStyles"
            use:enhance={() =>
              async ({ result, update }) => {
                if (result.type === 'success') stylesDirty = false;
                await update();
              }}
            bind:this={stylesForm}
            oninput={styleChanged}
            onchange={styleChanged}
            class="space-y-6"
          >
            <input type="hidden" name="theme" value={editor.id} />
            <fieldset class="space-y-3">
              <legend class="text-sm font-medium">{m.themeColors}</legend>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {#each editor.settings.palette as color (color.slug)}
                  <label
                    class="flex items-center gap-3 rounded-md border p-2 text-sm"
                  >
                    <input
                      type="color"
                      name="color.{color.slug}"
                      value={color.color}
                      class="size-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <span class="min-w-0">
                      <span class="block font-medium">{color.name}</span>
                      <span
                        class="block font-mono text-xs text-muted-foreground"
                        >{color.slug}</span
                      >
                    </span>
                  </label>
                {/each}
              </div>
            </fieldset>
            <fieldset class="space-y-3">
              <legend class="text-sm font-medium">{m.editorTypography}</legend>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="grid gap-1.5">
                  <Label for="fontFamily">{m.editorFontFamily}</Label>
                  <NativeSelect
                    id="fontFamily"
                    name="fontFamily"
                    class="w-full"
                    value={styles.fontFamily}
                  >
                    {#each editor.settings.fontFamilies as font (font.slug)}
                      <NativeSelectOption value={font.slug}
                        >{font.name}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                </div>
                <div class="grid gap-1.5">
                  <Label for="headingFontFamily">{m.editorHeadingFont}</Label>
                  <NativeSelect
                    id="headingFontFamily"
                    name="headingFontFamily"
                    class="w-full"
                    value={styles.headingFontFamily}
                  >
                    <NativeSelectOption value=""
                      >{m.editorSameAsBody}</NativeSelectOption
                    >
                    {#each editor.settings.fontFamilies as font (font.slug)}
                      <NativeSelectOption value={font.slug}
                        >{font.name}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                </div>
                <div class="grid gap-1.5">
                  <Label for="fontSize">{m.editorFontSize}</Label>
                  <NativeSelect
                    id="fontSize"
                    name="fontSize"
                    class="w-full"
                    value={styles.fontSize}
                  >
                    {#each THEME_FONT_SIZES as size (size)}
                      <NativeSelectOption value={size}
                        >{m.blockOption(size)}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                </div>
                <div class="grid gap-1.5">
                  <Label for="lineHeight">{m.editorLineHeight}</Label>
                  <NativeSelect
                    id="lineHeight"
                    name="lineHeight"
                    class="w-full"
                    value={styles.lineHeight}
                  >
                    {#each THEME_LINE_HEIGHTS as height (height)}
                      <NativeSelectOption value={height}
                        >{m.blockOption(height)}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                </div>
                <div class="grid gap-1.5">
                  <Label for="radius">{m.editorRadius}</Label>
                  <NativeSelect
                    id="radius"
                    name="radius"
                    class="w-full"
                    value={styles.radius}
                  >
                    {#each THEME_RADII as radius (radius)}
                      <NativeSelectOption value={radius}
                        >{m.blockOption(radius)}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                </div>
              </div>
            </fieldset>
            <div class="flex flex-wrap gap-2">
              <Button type="submit">{m.save}</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!stylesCan.undo}
                title="{m.editorUndo} (Ctrl+Z)"
                onclick={() => styleStep('undo')}
                ><Undo2 class="size-4" /> {m.editorUndo}</Button
              >
              <Button
                type="button"
                variant="ghost"
                disabled={!stylesCan.redo}
                title="{m.editorRedo} (Ctrl+Shift+Z)"
                onclick={() => styleStep('redo')}
                ><Redo2 class="size-4" /> {m.editorRedo}</Button
              >
            </div>
          </form>
          <div class="mt-6 space-y-2">
            <span class="text-sm font-medium">{m.editorLivePreview}</span>
            <div class="overflow-auto rounded border bg-muted p-2">
              <div
                class="cms-site mx-auto min-h-64 bg-background text-foreground"
                style={themeStyle(styledTheme)}
                inert
              >
                {#if data.previewPage}
                  <TemplateView
                    data={{ ...data.canvas, ...canvasData, theme: styledTheme }}
                    page={data.previewPage}
                  />
                {:else}
                  <p class="p-4 text-muted-foreground">{m.noPosts}</p>
                {/if}
              </div>
            </div>
          </div>
          {#if editor.styles.customized}
            <form
              method="POST"
              action="?/resetStyles"
              use:enhance={confirmReset}
              class="mt-2"
            >
              <input type="hidden" name="theme" value={editor.id} />
              <Button type="submit" variant="ghost">{m.editorReset}</Button>
            </form>
          {/if}
        </CardContent>
      </Card>
    {:else}
      {@const item =
        selected.kind === 'template'
          ? {
              title: m.templateLabel(selected.template.name),
              detail: `templates/${selected.template.name}.json`,
              blocks: selected.template.blocks,
              key: `template:${selected.template.name}`,
              save: '?/saveTemplate',
              reset: '?/resetTemplate',
              field: 'name',
              value: selected.template.name,
              customized: selected.template.customized,
              resetLabel: selected.template.inTheme
                ? m.editorReset
                : m.editorDelete,
            }
          : {
              title: selected.part.title,
              detail: `parts/${selected.part.slug}.json`,
              blocks: selected.part.blocks,
              key: `part:${selected.part.slug}`,
              save: '?/savePart',
              reset: '?/resetPart',
              field: 'slug',
              value: selected.part.slug,
              customized: selected.part.customized,
              resetLabel: m.editorReset,
            }}
      <!-- `overflow-clip` rounds the corners like the card's `overflow-hidden` without becoming a scroll container, so the editor's side panels can stick while the page scrolls. -->
      <Card class="overflow-clip">
        <CardHeader>
          <CardTitle class="flex flex-wrap items-center gap-2">
            {item.title}
            {#if item.customized}<Badge variant="outline"
                >{m.editorCustomized}</Badge
              >{/if}
          </CardTitle>
          <CardDescription class="font-mono text-xs"
            >{item.detail}</CardDescription
          >
        </CardHeader>
        <CardContent class="space-y-4">
          {#key `${editor.id}/${item.key}/${item.customized}`}
            <form
              id="theme-blocks"
              hidden
              method="POST"
              action={item.save}
              use:enhance={keep}
            >
              <input type="hidden" name="theme" value={editor.id} />
              <input type="hidden" name={item.field} value={item.value} />
            </form>
            <div class="space-y-4">
              <BlockTreeEditor
                form="theme-blocks"
                blocks={item.blocks}
                {colors}
                {parts}
                onchange={(changed, tree) => {
                  dirty = changed;
                  canvasBlocks = tree;
                }}
                onselect={(key) => (selectedBlock = key)}
              >
                {#snippet canvas(select)}
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <span class="text-sm font-medium"
                      >{m.editorLivePreview}</span
                    >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={mobile}
                      onclick={() => (mobile = !mobile)}
                      >{m.editorMobilePreview}</Button
                    >
                  </div>
                  <div class="overflow-auto rounded border bg-muted p-2">
                    <FormMessage form={previewError} />
                    <!-- Clicking selects the block under the pointer; List View offers the same by keyboard. -->
                    <div
                      class="cms-site cms-editor-canvas mx-auto min-h-64 cursor-default bg-background text-foreground"
                      style={`${themeStyle(data.canvas.theme)}; width: ${mobile ? '375px' : '100%'}; max-width: 100%`}
                      onclickcapture={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const target = (event.target as Element).closest(
                          '[data-block-path]',
                        );
                        const key = target?.getAttribute('data-block-path');
                        if (key) select(key.split('.').map(Number));
                      }}
                      onsubmitcapture={(event) => event.preventDefault()}
                    >
                      {#if data.previewPage}
                        <TemplateView
                          data={{
                            ...data.canvas,
                            ...canvasData,
                          }}
                          page={data.previewPage}
                          previewBlocks={canvasBlocks ?? item.blocks}
                          editable
                        />
                      {:else}
                        <p class="p-4 text-muted-foreground">{m.noPosts}</p>
                      {/if}
                    </div>
                  </div>
                {/snippet}
              </BlockTreeEditor>
              <div class="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button type="submit" form="theme-blocks">{m.save}</Button>
                {#if dirty}
                  <span class="text-sm text-muted-foreground" role="status"
                    >{m.editorUnsaved}</span
                  >
                {/if}
              </div>
            </div>
          {/key}
          {#if item.customized}
            <form method="POST" action={item.reset} use:enhance={confirmReset}>
              <input type="hidden" name="theme" value={editor.id} />
              <input type="hidden" name={item.field} value={item.value} />
              <Button type="submit" variant="ghost">{item.resetLabel}</Button>
            </form>
          {/if}
        </CardContent>
      </Card>
    {/if}
  </div>
</div>
