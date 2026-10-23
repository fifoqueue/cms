<script lang="ts">
  import { deserialize, enhance } from '$app/forms';
  import { MENU_LOCATIONS } from '@cms/sdk';
  import type { MenuItem } from '@cms/sdk';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    GripVertical,
    Search,
    Trash2,
  } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { confirmLeave } from '#lib/admin/unsaved.js';
  import {
    indent,
    moveDown,
    moveTo,
    moveUp,
    outdent,
    removeRow,
    toItems,
    toRows,
  } from '#lib/admin/menu-tree.js';
  import type { MenuRow } from '#lib/admin/menu-tree.js';
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
  import { typeLabel, useI18n } from '#lib/i18n/index.js';
  import { SvelteMap } from 'svelte/reactivity';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  // The editor works on a local copy; saving sends it whole.
  // svelte-ignore state_referenced_locally
  let menus = $state(
    data.menus.menus.map(({ id, name, items }) => ({
      id,
      name,
      rows: toRows(items),
    })),
  );
  // svelte-ignore state_referenced_locally
  let locations = $state({ ...data.menus.locations });
  // svelte-ignore state_referenced_locally
  let selected = $state(menus[0]?.id ?? '');
  let newMenu = $state('');
  const current = $derived(menus.find((menu) => menu.id === selected));

  let kind = $state<MenuItem['kind']>('content');
  let url = $state('');
  let label = $state('');
  let contentId = $state('');
  let term = $state('');
  let archive = $state('');

  /** Search results of the content picker; null shows the most recent entries. */
  let found = $state<{ id: string; title: string; type: string }[] | null>(
    null,
  );
  let query = $state('');
  let searching = $state(false);
  /** Titles of entries picked from search results, kept after a new search. */
  const picked = new SvelteMap<string, string>();

  const find = async () => {
    searching = true;
    try {
      const body = new FormData();
      body.set('q', query);
      const response = await fetch('?/find', {
        method: 'POST',
        body,
        headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
      });
      const result = deserialize(await response.text());
      found =
        result.type === 'success'
          ? ((result.data?.found as typeof found) ?? [])
          : [];
      contentId = '';
    } finally {
      searching = false;
    }
  };

  const titles = $derived(
    new Map([
      ...data.content.map((entry) => [`content:${entry.id}`, entry.title]),
      ...data.titles.map((entry) => [`content:${entry.id}`, entry.title]),
      ...[...picked].map(([id, title]) => [`content:${id}`, title]),
      ...data.categories.map((entry) => [`category:${entry.id}`, entry.name]),
      ...data.tags.map((entry) => [`tag:${entry.id}`, entry.name]),
      ...data.archives.map((entry) => [`archive:${entry.key}`, entry.name]),
    ] as [string, string][]),
  );

  const target = (row: MenuRow) => {
    switch (row.kind) {
      case 'home':
        return m.menuHome;
      case 'custom':
        return row.url ?? '';
      case 'content':
        return titles.get(`content:${row.contentId}`) ?? m.menuMissing;
      case 'term':
        return titles.get(`${row.taxonomy}:${row.termId}`) ?? m.menuMissing;
      case 'archive':
        return titles.get(`archive:${row.archive}`) ?? m.menuMissing;
    }
  };

  const edit = (change: (rows: MenuRow[]) => MenuRow[]) => {
    if (current) current.rows = change(current.rows);
  };

  const addMenu = () => {
    const name = newMenu.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    menus.push({ id, name, rows: [] });
    selected = id;
    newMenu = '';
  };

  /** Row being dragged; arrow buttons stay for keyboards. */
  let dragged = $state<number | null>(null);
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragged !== null) {
      const from = dragged;
      edit((rows) => moveTo(rows, from, index));
    }
    dragged = null;
  };

  const deleteMenu = () => {
    if (!confirm(m.menuDeleteConfirm(current?.name ?? ''))) return;
    menus = menus.filter((menu) => menu.id !== selected);
    for (const location of MENU_LOCATIONS)
      if (locations[location] === selected) locations[location] = null;
    selected = menus[0]?.id ?? '';
  };

  const addItem = () => {
    const choice = found?.find((entry) => entry.id === contentId);
    if (kind === 'content' && choice) picked.set(choice.id, choice.title);
    const [taxonomy, termId] = term.split(':') as ['category' | 'tag', string];
    const row: MenuRow = {
      id: crypto.randomUUID(),
      label: label.trim(),
      kind,
      newTab: false,
      depth: 0,
      ...(kind === 'custom' && { url: url.trim() }),
      ...(kind === 'content' && { contentId }),
      ...(kind === 'term' && { taxonomy, termId }),
      ...(kind === 'archive' && { archive }),
    };
    edit((rows) => [...rows, row]);
    label = '';
    url = '';
  };

  const ready = $derived(
    kind === 'home' ||
      (kind === 'custom' && url.trim() !== '') ||
      (kind === 'content' && contentId !== '') ||
      (kind === 'term' && term !== '') ||
      (kind === 'archive' && archive !== ''),
  );

  const payload = $derived(
    JSON.stringify({
      menus: menus.map(({ id, name, rows }) => ({
        id,
        name,
        items: toItems(rows),
      })),
      locations,
    }),
  );

  // What the server has; leaving with anything else asks first.
  // svelte-ignore state_referenced_locally
  let saved = payload;
  confirmLeave(
    () => payload !== saved,
    () => m.unsavedLeave,
  );

  const locationNames = $derived({
    primary: m.primaryNavigation,
    footer: m.footerNavigation,
  });
</script>

<svelte:head><title>{m.appearanceMenus}</title></svelte:head>

<FormMessage {form} />

<form
  method="POST"
  action="?/save"
  use:enhance={() => {
    const sent = payload;
    return async ({ result, update }) => {
      if (result.type === 'success') saved = sent;
      await update({ reset: false });
    };
  }}
  class="grid gap-6"
>
  <input type="hidden" name="menus" value={payload} />

  <Card>
    <CardHeader><CardTitle>{m.appearanceMenus}</CardTitle></CardHeader>
    <CardContent class="flex flex-wrap items-end gap-3">
      {#if menus.length}
        <div class="grid gap-2">
          <Label for="menu">{m.menuSelect}</Label>
          <NativeSelect id="menu" bind:value={selected}>
            {#each menus as menu (menu.id)}
              <NativeSelectOption value={menu.id}
                >{menu.name}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>
      {/if}
      <div class="grid gap-2">
        <Label for="new-menu">{m.menuNew}</Label>
        <Input id="new-menu" maxlength={100} bind:value={newMenu} />
      </div>
      <Button type="button" variant="outline" onclick={addMenu}
        >{m.menuCreate}</Button
      >
    </CardContent>
  </Card>

  {#if current}
    <Card>
      <CardHeader class="flex flex-row items-center justify-between gap-3">
        <div class="grid flex-1 gap-2">
          <Label for="menu-name">{m.menuName}</Label>
          <Input
            id="menu-name"
            maxlength={100}
            required
            bind:value={current.name}
          />
        </div>
        <Button type="button" variant="ghost" onclick={deleteMenu}
          >{m.menuDelete}</Button
        >
      </CardHeader>
      <CardContent class="grid gap-6">
        {#if current.rows.length}
          <ol class="grid gap-2">
            {#each current.rows as row, index (row.id)}
              <li
                class="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 {dragged ===
                index
                  ? 'opacity-50'
                  : ''}"
                style:margin-inline-start="{row.depth * 1.5}rem"
                draggable="true"
                ondragstart={(event) => {
                  dragged = index;
                  event.dataTransfer?.setData('text/plain', row.id);
                }}
                ondragend={() => (dragged = null)}
                ondragover={(event) => event.preventDefault()}
                ondrop={(event) => drop(event, index)}
              >
                <GripVertical
                  class="size-4 shrink-0 cursor-grab text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  aria-label={m.menuLabel}
                  placeholder={target(row)}
                  maxlength={191}
                  class="h-8 w-48"
                  bind:value={row.label}
                />
                {#if row.kind === 'custom'}
                  <Input
                    aria-label={m.menuUrl}
                    maxlength={2048}
                    class="h-8 w-64"
                    bind:value={row.url}
                  />
                {:else}
                  <span class="text-sm text-muted-foreground"
                    >{target(row)}</span
                  >
                {/if}
                <label class="flex items-center gap-1 text-xs">
                  <input type="checkbox" bind:checked={row.newTab} />
                  {m.menuNewTab}
                </label>
                <span class="ml-auto flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={m.moveUp}
                    onclick={() => edit((rows) => moveUp(rows, index))}
                    ><ArrowUp class="size-4" /></Button
                  >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={m.moveDown}
                    onclick={() => edit((rows) => moveDown(rows, index))}
                    ><ArrowDown class="size-4" /></Button
                  >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={m.menuOutdent}
                    onclick={() => edit((rows) => outdent(rows, index))}
                    ><ArrowLeft class="size-4" /></Button
                  >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={m.menuIndent}
                    onclick={() => edit((rows) => indent(rows, index))}
                    ><ArrowRight class="size-4" /></Button
                  >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={m.remove}
                    onclick={() => edit((rows) => removeRow(rows, index))}
                    ><Trash2 class="size-4" /></Button
                  >
                </span>
              </li>
            {/each}
            <li
              class="h-6 rounded-md border border-dashed {dragged === null
                ? 'hidden'
                : ''}"
              aria-hidden="true"
              ondragover={(event) => event.preventDefault()}
              ondrop={(event) => drop(event, current.rows.length)}
            ></li>
          </ol>
        {:else}
          <p class="text-sm text-muted-foreground">{m.menuEmpty}</p>
        {/if}

        <fieldset class="grid gap-3 rounded-md border p-4">
          <legend class="px-1 text-sm font-medium">{m.menuAddItem}</legend>
          <div class="flex flex-wrap items-end gap-3">
            <div class="grid gap-2">
              <Label for="item-kind">{m.menuItemKind}</Label>
              <NativeSelect id="item-kind" bind:value={kind}>
                <NativeSelectOption value="content"
                  >{m.menuKindContent}</NativeSelectOption
                >
                <NativeSelectOption value="term"
                  >{m.menuKindTerm}</NativeSelectOption
                >
                <NativeSelectOption value="archive"
                  >{m.menuKindArchive}</NativeSelectOption
                >
                <NativeSelectOption value="custom"
                  >{m.menuKindCustom}</NativeSelectOption
                >
                <NativeSelectOption value="home"
                  >{m.menuHome}</NativeSelectOption
                >
              </NativeSelect>
            </div>
            {#if kind === 'content'}
              <div class="grid gap-2">
                <Label for="item-find">{m.menuFindContent}</Label>
                <div class="flex gap-2">
                  <Input
                    id="item-find"
                    type="search"
                    maxlength={200}
                    class="w-48"
                    bind:value={query}
                    onkeydown={(event) => {
                      // Enter searches instead of saving the menus.
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      void find();
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={m.search}
                    disabled={searching}
                    onclick={find}><Search class="size-4" /></Button
                  >
                </div>
              </div>
              <div class="grid gap-2">
                <Label for="item-content"
                  >{found ? m.menuSearchResults : m.menuMostRecent}</Label
                >
                <NativeSelect id="item-content" bind:value={contentId}>
                  <NativeSelectOption value=""
                    >{found && !found.length
                      ? m.menuNoResults
                      : m.noChoice}</NativeSelectOption
                  >
                  {#each found ?? data.content as entry (entry.id)}
                    <NativeSelectOption value={entry.id}
                      >{entry.title}{'type' in entry
                        ? ` (${typeLabel(m, String(entry.type))})`
                        : ''}</NativeSelectOption
                    >
                  {/each}
                </NativeSelect>
              </div>
            {:else if kind === 'term'}
              <div class="grid gap-2">
                <Label for="item-term">{m.menuKindTerm}</Label>
                <NativeSelect id="item-term" bind:value={term}>
                  <NativeSelectOption value="">{m.noChoice}</NativeSelectOption>
                  <optgroup label={m.navCategories}>
                    {#each data.categories as entry (entry.id)}
                      <option value="category:{entry.id}">{entry.name}</option>
                    {/each}
                  </optgroup>
                  <optgroup label={m.navTags}>
                    {#each data.tags as entry (entry.id)}
                      <option value="tag:{entry.id}">{entry.name}</option>
                    {/each}
                  </optgroup>
                </NativeSelect>
              </div>
            {:else if kind === 'archive'}
              <div class="grid gap-2">
                <Label for="item-archive">{m.menuKindArchive}</Label>
                <NativeSelect id="item-archive" bind:value={archive}>
                  <NativeSelectOption value="">{m.noChoice}</NativeSelectOption>
                  {#each data.archives as entry (entry.key)}
                    <NativeSelectOption value={entry.key}
                      >{entry.name}</NativeSelectOption
                    >
                  {/each}
                </NativeSelect>
              </div>
            {:else if kind === 'custom'}
              <div class="grid gap-2">
                <Label for="item-url">{m.menuUrl}</Label>
                <Input
                  id="item-url"
                  maxlength={2048}
                  placeholder="https://…"
                  bind:value={url}
                />
              </div>
            {/if}
            <div class="grid gap-2">
              <Label for="item-label">{m.menuLabel}</Label>
              <Input id="item-label" maxlength={191} bind:value={label} />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!ready}
              onclick={addItem}>{m.add}</Button
            >
          </div>
        </fieldset>
      </CardContent>
    </Card>
  {/if}

  <Card>
    <CardHeader><CardTitle>{m.menuLocations}</CardTitle></CardHeader>
    <CardContent class="grid gap-4 sm:grid-cols-2">
      {#each MENU_LOCATIONS as location (location)}
        <div class="grid gap-2">
          <Label for="location-{location}">{locationNames[location]}</Label>
          <NativeSelect
            class="w-full"
            id="location-{location}"
            value={locations[location] ?? ''}
            onchange={(event) =>
              (locations[location] = event.currentTarget.value || null)}
          >
            <NativeSelectOption value="">{m.noChoice}</NativeSelectOption>
            {#each menus as menu (menu.id)}
              <NativeSelectOption value={menu.id}
                >{menu.name}</NativeSelectOption
              >
            {/each}
          </NativeSelect>
        </div>
      {/each}
    </CardContent>
  </Card>

  <div><Button type="submit">{m.save}</Button></div>
</form>
