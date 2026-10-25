<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { fontsActionUrl } from '#lib/admin/font-issues.js';
  import { FONT_DISPLAYS } from '@cms/sdk';
  import type { SiteFont } from '@cms/sdk';
  import {
    errorMessage,
    issueLines,
    issueText,
  } from '#lib/admin/form-errors.js';
  import { fontIssues } from '#lib/admin/font-issues.js';
  import type { FontField, FontFormValues } from '#lib/admin/font-issues.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  interface Issue {
    path: string;
    message: string;
    params?: Record<string, string | number>;
  }

  /**
   * Site fonts (Appearance → Editor → Styles): families every theme's typography can use, from
   * an external stylesheet or from font files (an https address or a media library file). A
   * refused change shows here: the refusal above the add form, field issues under their inputs,
   * with what was entered kept.
   */
  let {
    fonts,
    theme,
    failure = null,
  }: {
    fonts: SiteFont[];
    theme: string;
    failure?: {
      message?: string;
      code?: string;
      issues?: unknown;
      fontForm: FontFormValues;
    } | null;
  } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $props.id();
  // Posting to the current address keeps the theme and the Styles panel open after the action.
  const actionUrl = $derived(fontsActionUrl(page.url.search));
  const values = $derived(failure?.fontForm ?? {});
  let source = $state<'stylesheet' | 'file'>('stylesheet');
  // A refused attempt comes back with the source it used.
  $effect(() => {
    if (failure)
      source = failure.fontForm.source === 'file' ? 'file' : 'stylesheet';
  });
  const issues = $derived(
    Array.isArray(failure?.issues) ? (failure.issues as Issue[]) : [],
  );
  const grouped = $derived(fontIssues(issues));
  const refusal = $derived(
    failure && {
      title: errorMessage(m, i18n.language, {
        message: failure.message,
        code: failure.code,
        issues,
      }),
      lines: issueLines(m, i18n.language, grouped.rest, failure.message),
    },
  );
  const hasIssues = (field: FontField) => !!grouped.fields[field]?.length;
  const describedBy = (field: FontField) =>
    hasIssues(field) ? `${id}-${field}-error` : undefined;
</script>

{#snippet fieldIssues(field: FontField)}
  {#if grouped.fields[field]?.length}
    <p id="{id}-{field}-error" class="text-sm text-destructive">
      {#each grouped.fields[field] ?? [] as issue, index (index)}
        {#if index}<br />{/if}{issueText(
          m,
          i18n.language,
          issue.message,
          issue.params,
        )}
      {/each}
    </p>
  {/if}
{/snippet}

<section class="space-y-4" aria-labelledby="{id}-title">
  <div class="space-y-1">
    <h3 id="{id}-title" class="text-sm font-medium">{m.editorFonts}</h3>
    <p class="text-sm text-muted-foreground">{m.editorFontsHelp}</p>
  </div>
  {#if fonts.length}
    <ul class="divide-y rounded-md border">
      {#each fonts as font (font.slug)}
        <li
          class="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
        >
          <span class="min-w-0">
            <span class="block font-medium">{font.family}</span>
            <span class="block truncate text-xs text-muted-foreground"
              >{font.stylesheet ||
                font.faces
                  .map((face) => `${face.weight} ${face.style} · ${face.src}`)
                  .join(', ')}</span
            >
          </span>
          <form method="POST" action={actionUrl} use:enhance>
            <input type="hidden" name="op" value="remove" />
            <input type="hidden" name="theme" value={theme} />
            <input type="hidden" name="slug" value={font.slug} />
            <Button type="submit" variant="ghost" size="sm"
              >{m.editorFontRemove}</Button
            >
          </form>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-muted-foreground">{m.editorFontsEmpty}</p>
  {/if}
  {#if refusal}
    <div
      class="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
      role="alert"
    >
      <p class="font-medium">{refusal.title}</p>
      {#each refusal.lines as line, index (index)}
        <p>{line}</p>
      {/each}
    </div>
  {/if}
  <form
    method="POST"
    action={actionUrl}
    use:enhance
    class="grid gap-3 rounded-md border p-3 sm:grid-cols-2"
  >
    <input type="hidden" name="op" value="add" />
    <input type="hidden" name="theme" value={theme} />
    <div class="grid gap-1.5">
      <Label for="{id}-family">{m.editorFontFamilyName}</Label>
      <Input
        id="{id}-family"
        name="family"
        required
        maxlength={64}
        placeholder="Nanum Gothic"
        value={values.family ?? ''}
        aria-invalid={hasIssues('family') || undefined}
        aria-describedby={describedBy('family')}
      />
      {@render fieldIssues('family')}
    </div>
    <div class="grid gap-1.5">
      <Label for="{id}-fallback">{m.editorFontFallback}</Label>
      <Input
        id="{id}-fallback"
        name="fallback"
        maxlength={200}
        placeholder="sans-serif"
        value={values.fallback ?? ''}
        aria-invalid={hasIssues('fallback') || undefined}
        aria-describedby={describedBy('fallback')}
      />
      {@render fieldIssues('fallback')}
    </div>
    <div class="grid gap-1.5 sm:col-span-2">
      <Label for="{id}-source">{m.editorFontSource}</Label>
      <NativeSelect
        id="{id}-source"
        name="source"
        class="w-full"
        bind:value={source}
      >
        <NativeSelectOption value="stylesheet"
          >{m.editorFontStylesheet}</NativeSelectOption
        >
        <NativeSelectOption value="file">{m.editorFontFile}</NativeSelectOption>
      </NativeSelect>
    </div>
    {#if source === 'stylesheet'}
      <div class="grid gap-1.5 sm:col-span-2">
        <Label for="{id}-stylesheet">{m.editorFontStylesheetUrl}</Label>
        <Input
          id="{id}-stylesheet"
          name="stylesheet"
          type="url"
          required
          placeholder="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&display=swap"
          value={values.stylesheet ?? ''}
          aria-invalid={hasIssues('stylesheet') || undefined}
          aria-describedby={describedBy('stylesheet')}
        />
        {@render fieldIssues('stylesheet')}
      </div>
    {:else}
      <div class="grid gap-1.5 sm:col-span-2">
        <Label for="{id}-src">{m.editorFontFileUrl}</Label>
        <Input
          id="{id}-src"
          name="src"
          required
          placeholder="/media/2026/10/nanum-gothic.woff2"
          value={values.src ?? ''}
          aria-invalid={hasIssues('src') || undefined}
          aria-describedby={describedBy('src')}
        />
        {@render fieldIssues('src')}
      </div>
      <div class="grid gap-1.5">
        <Label for="{id}-weight">{m.editorFontWeight}</Label>
        <Input
          id="{id}-weight"
          name="weight"
          type="number"
          min={1}
          max={1000}
          value={values.weight || '400'}
          aria-invalid={hasIssues('weight') || undefined}
          aria-describedby={describedBy('weight')}
        />
        {@render fieldIssues('weight')}
      </div>
      <div class="grid gap-1.5">
        <Label for="{id}-style">{m.editorFontStyle}</Label>
        <NativeSelect
          id="{id}-style"
          name="style"
          class="w-full"
          value={values.style || 'normal'}
          aria-invalid={hasIssues('style') || undefined}
          aria-describedby={describedBy('style')}
        >
          <NativeSelectOption value="normal"
            >{m.editorFontNormal}</NativeSelectOption
          >
          <NativeSelectOption value="italic"
            >{m.editorFontItalic}</NativeSelectOption
          >
        </NativeSelect>
        {@render fieldIssues('style')}
      </div>
      <div class="grid gap-1.5">
        <Label for="{id}-display">{m.editorFontDisplay}</Label>
        <NativeSelect
          id="{id}-display"
          name="display"
          class="w-full"
          value={values.display || 'swap'}
          aria-invalid={hasIssues('display') || undefined}
          aria-describedby={describedBy('display')}
        >
          {#each FONT_DISPLAYS as display (display)}
            <NativeSelectOption value={display}>{display}</NativeSelectOption>
          {/each}
        </NativeSelect>
        {@render fieldIssues('display')}
      </div>
    {/if}
    <div class="sm:col-span-2">
      <Button type="submit">{m.editorFontAdd}</Button>
    </div>
  </form>
</section>
