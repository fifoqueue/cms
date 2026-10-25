<script lang="ts">
  import { saveSnapshot } from '#lib/admin/save-snapshot.js';
  import { enhance } from '$app/forms';
  import { WIDGET_AREAS } from '@cms/sdk';
  import type { Widget, WidgetArea } from '@cms/sdk';
  import { default as ArrowDown } from '@lucide/svelte/icons/arrow-down';
  import { default as ArrowUp } from '@lucide/svelte/icons/arrow-up';
  import { default as GripVertical } from '@lucide/svelte/icons/grip-vertical';
  import { default as Trash2 } from '@lucide/svelte/icons/trash-2';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import { confirmLeave } from '#lib/admin/unsaved.js';
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
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  // svelte-ignore state_referenced_locally
  let areas = $state(structuredClone(data.widgets));
  // What the server has; leaving with anything else asks first.
  // svelte-ignore state_referenced_locally
  let saved = JSON.stringify(data.widgets);
  confirmLeave(
    () => JSON.stringify(areas) !== saved,
    () => m.unsavedLeave,
  );
  let type = $state('recentPosts');
  let area = $state<WidgetArea>('sidebar');

  const names = $derived<Record<string, string>>({
    recentPosts: m.widgetRecentPosts,
    categories: m.navCategories,
    tags: m.navTags,
    search: m.search,
    text: m.widgetText,
    menu: m.widgetMenu,
    archives: m.widgetArchives,
    recentComments: m.widgetRecentComments,
    image: m.widgetImage,
    ...Object.fromEntries(
      data.types.plugins.map((option) => [option.type, option.name]),
    ),
  });
  const areaNames = $derived({ sidebar: m.sidebar, footer: m.widgetFooter });
  const counted = ['recentPosts', 'tags', 'archives', 'recentComments'];

  const move = (from: WidgetArea, index: number, by: number) => {
    const list = areas[from];
    const target = index + by;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
  };

  /** Widget being dragged; the arrow and move buttons stay for keyboards. */
  let dragging = $state<{ area: WidgetArea; index: number } | null>(null);
  /** Drops the dragged widget in front of `index` in `to` (any area). */
  const dropAt = (event: DragEvent, to: WidgetArea, index: number) => {
    event.preventDefault();
    if (!dragging) return;
    const { area: from, index: start } = dragging;
    dragging = null;
    const [widget] = areas[from].splice(start, 1);
    if (!widget) return;
    areas[to].splice(
      from === to && start < index ? index - 1 : index,
      0,
      widget,
    );
  };
  const transfer = (from: WidgetArea, index: number, to: WidgetArea) => {
    const [widget] = areas[from].splice(index, 1);
    if (widget) areas[to].push(widget);
  };

  const add = () => {
    const widget: Widget = {
      id: crypto.randomUUID(),
      type,
      title: '',
      settings: {},
    };
    areas[area].push(widget);
  };

  let picker: ReturnType<typeof MediaPicker>;
  let picking: Widget | null = null;

  const setting = (
    widget: Widget,
    key: string,
    value: string | number | boolean,
  ) => {
    widget.settings = { ...widget.settings, [key]: value };
  };
</script>

<svelte:head><title>{m.appearanceWidgets}</title></svelte:head>

<FormMessage {form} />

<form
  method="POST"
  action="?/save"
  use:enhance={saveSnapshot(
    () => JSON.stringify(areas),
    (sent) => (saved = sent),
  )}
  class="grid gap-6"
>
  <input type="hidden" name="widgets" value={JSON.stringify(areas)} />

  <Card>
    <CardHeader><CardTitle>{m.widgetAdd}</CardTitle></CardHeader>
    <CardContent class="flex flex-wrap items-end gap-3">
      <div class="grid gap-2">
        <Label for="widget-type">{m.widgetType}</Label>
        <NativeSelect id="widget-type" bind:value={type}>
          {#each [...data.types.core, ...data.types.plugins.map((option) => option.type)] as option (option)}
            <NativeSelectOption value={option}
              >{names[option]}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <div class="grid gap-2">
        <Label for="widget-area">{m.widgetArea}</Label>
        <NativeSelect id="widget-area" bind:value={area}>
          {#each WIDGET_AREAS as option (option)}
            <NativeSelectOption value={option}
              >{areaNames[option]}</NativeSelectOption
            >
          {/each}
        </NativeSelect>
      </div>
      <Button type="button" variant="outline" onclick={add}>{m.add}</Button>
    </CardContent>
  </Card>

  {#each WIDGET_AREAS as name (name)}
    <Card>
      <CardHeader><CardTitle>{areaNames[name]}</CardTitle></CardHeader>
      <CardContent class="grid gap-3">
        {#each areas[name] as widget, index (widget.id)}
          <div
            class="grid gap-3 rounded-md border bg-background p-3 {dragging?.area ===
              name && dragging.index === index
              ? 'opacity-50'
              : ''}"
            role="group"
            aria-label={names[widget.type] ?? widget.type}
            draggable="true"
            ondragstart={(event) => {
              dragging = { area: name, index };
              event.dataTransfer?.setData('text/plain', widget.id);
            }}
            ondragend={() => (dragging = null)}
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => dropAt(event, name, index)}
          >
            <div class="flex flex-wrap items-center gap-2">
              <GripVertical
                class="size-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden="true"
              />
              <span class="text-sm font-medium"
                >{names[widget.type] ?? widget.type}</span
              >
              <span class="ml-auto flex flex-wrap gap-1">
                {#each WIDGET_AREAS.filter((other) => other !== name) as other (other)}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onclick={() => transfer(name, index, other)}
                    >{m.widgetMoveTo(areaNames[other])}</Button
                  >
                {/each}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={m.moveUp}
                  onclick={() => move(name, index, -1)}
                  ><ArrowUp class="size-4" /></Button
                >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={m.moveDown}
                  onclick={() => move(name, index, 1)}
                  ><ArrowDown class="size-4" /></Button
                >
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={m.remove}
                  onclick={() => areas[name].splice(index, 1)}
                  ><Trash2 class="size-4" /></Button
                >
              </span>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="title-{widget.id}">{m.widgetTitle}</Label>
                <Input
                  id="title-{widget.id}"
                  maxlength={191}
                  bind:value={widget.title}
                />
              </div>
              {#if counted.includes(widget.type)}
                <div class="grid gap-2">
                  <Label for="count-{widget.id}">{m.widgetCount}</Label>
                  <Input
                    id="count-{widget.id}"
                    type="number"
                    min={1}
                    max={30}
                    value={Number(widget.settings.count) || 5}
                    oninput={(event) =>
                      setting(
                        widget,
                        'count',
                        Number(event.currentTarget.value),
                      )}
                  />
                </div>
              {:else if widget.type === 'menu'}
                <div class="grid gap-2">
                  <Label for="menu-{widget.id}">{m.widgetMenu}</Label>
                  <NativeSelect
                    class="w-full"
                    id="menu-{widget.id}"
                    value={String(widget.settings.menuId ?? '')}
                    onchange={(event) =>
                      setting(widget, 'menuId', event.currentTarget.value)}
                  >
                    <NativeSelectOption value=""
                      >{m.noChoice}</NativeSelectOption
                    >
                    {#each data.menus as menu (menu.id)}
                      <NativeSelectOption value={menu.id}
                        >{menu.name}</NativeSelectOption
                      >
                    {/each}
                  </NativeSelect>
                </div>
              {:else if widget.type === 'categories'}
                <label class="flex items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    checked={widget.settings.flat === true}
                    onchange={(event) =>
                      setting(widget, 'flat', event.currentTarget.checked)}
                  />
                  {m.widgetFlat}
                </label>
              {/if}
              {#if widget.type === 'text'}
                <div class="grid gap-2 sm:col-span-2">
                  <Label for="text-{widget.id}">{m.widgetText}</Label>
                  <Textarea
                    id="text-{widget.id}"
                    rows={4}
                    maxlength={5000}
                    value={String(widget.settings.text ?? '')}
                    aria-describedby="text-help-{widget.id}"
                    oninput={(event) =>
                      setting(widget, 'text', event.currentTarget.value)}
                  />
                  <p
                    id="text-help-{widget.id}"
                    class="text-xs text-muted-foreground"
                  >
                    {m.widgetTextHelp}
                  </p>
                </div>
              {:else if widget.type === 'image'}
                <div class="flex flex-wrap items-center gap-3 sm:col-span-2">
                  {#if widget.settings.src}
                    <img
                      src={String(widget.settings.src)}
                      alt=""
                      class="size-16 rounded-md border object-cover"
                    />
                  {/if}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      picking = widget;
                      picker.open();
                    }}>{m.mediaChoose}</Button
                  >
                </div>
                <div class="grid gap-2">
                  <Label for="alt-{widget.id}">{m.widgetImageAlt}</Label>
                  <Input
                    id="alt-{widget.id}"
                    maxlength={300}
                    value={String(widget.settings.alt ?? '')}
                    oninput={(event) =>
                      setting(widget, 'alt', event.currentTarget.value)}
                  />
                </div>
                <div class="grid gap-2">
                  <Label for="link-{widget.id}">{m.widgetImageLink}</Label>
                  <Input
                    id="link-{widget.id}"
                    maxlength={2048}
                    placeholder="https://"
                    value={String(widget.settings.link ?? '')}
                    oninput={(event) =>
                      setting(widget, 'link', event.currentTarget.value)}
                  />
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">{m.widgetEmpty}</p>
        {/each}
        <div
          class="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground {dragging
            ? ''
            : 'hidden'}"
          aria-hidden="true"
          ondragover={(event) => event.preventDefault()}
          ondrop={(event) => dropAt(event, name, areas[name].length)}
        >
          {m.widgetDropHere}
        </div>
      </CardContent>
    </Card>
  {/each}

  <div><Button type="submit">{m.save}</Button></div>
</form>

<MediaPicker
  bind:this={picker}
  onpick={(media) => {
    if (!picking) return;
    setting(picking, 'src', media.url);
    if (!picking.settings.alt) setting(picking, 'alt', media.alt);
  }}
/>
