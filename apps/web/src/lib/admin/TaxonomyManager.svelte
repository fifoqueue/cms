<script lang="ts">
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { DEFAULT_ENTRY_SEO } from '@cms/sdk';
  import type { TaxonomyType } from '@cms/sdk';
  import { Pencil, Trash2 } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import SeoEditor from '#lib/admin/SeoEditor.svelte';
  import type { SeoPreviewContext } from '#lib/admin/seo.js';
  import { seoFormValues } from '#lib/admin/seo.js';
  import { descendantIds, flattenTree } from '#lib/admin/taxonomy-tree.js';
  import { termLabel } from '#lib/seo/head.js';
  import { listingPath } from '#lib/seo/paths.js';
  import { termTarget } from '#lib/theme/pagination.js';
  import { useI18n } from '#lib/i18n/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '#lib/components/ui/table/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import type {
    AdminTermView,
    TermFormValues,
    TermIntent,
  } from '#lib/server/taxonomy-admin.js';

  interface TermForm {
    intent?: TermIntent;
    values?: TermFormValues;
    message?: string;
    issues?: unknown;
    notice?: string;
  }

  interface Props {
    taxonomy: TaxonomyType;
    hierarchical?: boolean;
    terms: AdminTermView[];
    editing: AdminTermView | null;
    seo: SeoPreviewContext;
    form?: TermForm | null;
  }

  let {
    taxonomy,
    terms,
    editing,
    seo,
    form,
    hierarchical = taxonomy !== 'tag',
  }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  const label = $derived(hierarchical ? m.termCategory : m.termTag);
  const title = $derived(hierarchical ? m.navCategories : m.navTags);
  const managerUrl = $derived(
    taxonomy === 'category'
      ? resolve('/admin/(app)/categories')
      : taxonomy === 'tag'
        ? resolve('/admin/(app)/tags')
        : resolve('/admin/(app)/taxonomies/[taxonomy]', { taxonomy }),
  );
  const rows = $derived(flattenTree(terms));

  /** A failed update keeps its own target, even if `?edit=` changed meanwhile. */
  const target = $derived(
    form?.intent === 'update' && form.values
      ? (terms.find((term) => term.id === form.values?.id) ?? editing)
      : editing,
  );
  const intent: TermIntent = $derived(target ? 'update' : 'create');

  const values: TermFormValues = $derived(
    form?.values && form.intent === intent
      ? form.values
      : target
        ? {
            id: target.id,
            name: target.name,
            slug: target.slug,
            description: target.description,
            parentId: target.parentId ?? '',
            seo: seoFormValues(target.seo),
          }
        : {
            id: '',
            name: '',
            slug: '',
            description: '',
            parentId: '',
            seo: seoFormValues(DEFAULT_ENTRY_SEO),
          },
  );
  // Live fields the SEO previews follow; reset whenever the edited term changes.
  let name = $derived(values.name);
  let slug = $derived(values.slug);
  let description = $derived(values.description);
  const termSlug = $derived(slug.trim() || (target?.slug ?? ''));

  // A term can never move below itself.
  const parentOptions = $derived.by(() => {
    const blocked = target ? descendantIds(terms, target.id) : new Set();
    return rows.filter(({ term }) => !blocked.has(term.id));
  });

  const keepValues: SubmitFunction =
    () =>
    ({ update }) =>
      update({ reset: false });

  const confirmDelete =
    (name: string): SubmitFunction =>
    ({ cancel }) => {
      if (!confirm(m.termDeleteConfirm(name))) cancel();
    };
</script>

{#snippet termFields()}
  <div class="grid gap-2">
    <Label for="term-name">{m.name}</Label>
    <Input
      id="term-name"
      name="name"
      required
      maxlength={191}
      bind:value={name}
    />
  </div>
  <div class="grid gap-2">
    <Label for="term-slug">{m.slug}</Label>
    <Input
      id="term-slug"
      name="slug"
      maxlength={191}
      placeholder={m.termSlugPlaceholder}
      bind:value={slug}
    />
  </div>
  {#if hierarchical}
    <div class="grid gap-2">
      <Label for="term-parent">{m.termParent}</Label>
      <NativeSelect
        id="term-parent"
        name="parentId"
        class="w-full"
        value={values.parentId}
      >
        <NativeSelectOption value="">{m.none}</NativeSelectOption>
        {#each parentOptions as { term, depth } (term.id)}
          <NativeSelectOption value={term.id}
            >{'— '.repeat(depth)}{term.name}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </div>
  {/if}
  <div class="grid gap-2">
    <Label for="term-description">{m.termDescription}</Label>
    <Textarea
      id="term-description"
      name="description"
      maxlength={1000}
      rows={3}
      bind:value={description}
    />
  </div>
{/snippet}

{#if target}
  <!-- WordPress term.php: the edit screen is a page of its own, SEO below the term fields. -->
  <div class="space-y-1">
    <a
      href={taxonomy === 'category'
        ? resolve('/admin/(app)/categories')
        : taxonomy === 'tag'
          ? resolve('/admin/(app)/tags')
          : resolve('/admin/(app)/taxonomies/[taxonomy]', { taxonomy })}
      class="text-sm text-muted-foreground hover:text-foreground">← {title}</a
    >
    <h1 class="text-2xl font-semibold">{m.termEdit(label)}</h1>
  </div>

  <FormMessage {form} />

  {#key `${intent}:${target.id}`}
    <form
      method="POST"
      action="?/update"
      use:enhance={keepValues}
      class="max-w-4xl space-y-6"
    >
      <input type="hidden" name="id" value={target.id} />
      <Card>
        <CardContent class="space-y-4 pt-6">
          {@render termFields()}
        </CardContent>
      </Card>
      <SeoEditor
        kind="term"
        initial={values.seo ?? seoFormValues(DEFAULT_ENTRY_SEO)}
        context={seo}
        source={{
          title: name.trim() ? `${termLabel(taxonomy, m)}: ${name.trim()}` : '',
          description,
          slug: termSlug,
          body: description,
          path: termSlug ? listingPath(termTarget(taxonomy, termSlug)) : null,
          pathHint: listingPath(termTarget(taxonomy, '…')),
          exclusion: !seo.indexingEnabled
            ? m.indexingOff
            : !(hierarchical ? seo.indexCategories : seo.indexTags)
              ? m.termNoIndex(label)
              : null,
        }}
      />
      <Button type="submit">{m.update}</Button>
    </form>
  {/key}
{:else}
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <h1 class="text-2xl font-semibold">{title}</h1>
    <p class="text-sm text-muted-foreground">
      {hierarchical ? m.categoriesHelp : m.tagsHelp}
    </p>
  </div>

  <FormMessage {form} />

  <!-- WordPress edit-tags.php: a short add form beside the list. -->
  <div class="grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
    <Card
      class="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
    >
      <CardHeader>
        <CardTitle>{m.termAddNew(label)}</CardTitle>
      </CardHeader>
      <CardContent>
        {#key intent}
          <form method="POST" action="?/create" use:enhance class="space-y-4">
            {@render termFields()}
            <Button type="submit">{m.termAdd(label)}</Button>
          </form>
        {/key}
      </CardContent>
    </Card>

    <div class="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.name}</TableHead>
            <TableHead>{m.slug}</TableHead>
            <TableHead class="hidden md:table-cell"
              >{m.termDescription}</TableHead
            >
            <TableHead class="text-right">{m.termCount}</TableHead>
            <TableHead class="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each rows as { term, depth } (term.id)}
            <TableRow>
              <TableCell class="font-medium">
                <span class="text-muted-foreground">{'— '.repeat(depth)}</span
                >{term.name}
              </TableCell>
              <TableCell class="text-sm text-muted-foreground"
                >{term.slug}</TableCell
              >
              <TableCell
                class="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell"
                >{term.description}</TableCell
              >
              <TableCell class="text-right">
                <a
                  href={resolve(
                    `/admin/(app)/content?${taxonomy === 'category' || taxonomy === 'tag' ? `${taxonomy}=${encodeURIComponent(term.slug)}` : `taxonomy=${encodeURIComponent(taxonomy)}&term=${encodeURIComponent(term.slug)}`}`,
                  )}
                  class="hover:underline"
                  aria-label={m.termCountLabel(term.count, term.name)}
                  >{term.count}</a
                >
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-1">
                  <Button
                    href={`${managerUrl}?edit=${term.id}`}
                    variant="ghost"
                    size="icon"
                    aria-label={m.editItem(term.name)}
                  >
                    <Pencil class="size-4" />
                  </Button>
                  <form
                    method="POST"
                    action="?/delete"
                    use:enhance={confirmDelete(term.name)}
                  >
                    <input type="hidden" name="id" value={term.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label={m.deleteItem(term.name)}
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          {:else}
            <TableRow>
              <TableCell
                colspan={5}
                class="py-10 text-center text-muted-foreground"
                >{hierarchical ? m.noCategories : m.noTags}</TableCell
              >
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  </div>
{/if}
