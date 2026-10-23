<script lang="ts">
  import { enhance } from '$app/forms';
  import { WIDGET_AREAS } from '@cms/sdk';
  import type { Widget, WidgetArea } from '@cms/sdk';
  import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
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

  const add = () => {
    const widget: Widget = {
      id: crypto.randomUUID(),
      type,
      title: '',
      settings: {},
    };
    areas[area].push(widget);
  };

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
  use:enhance={() => {
    const sent = JSON.stringify(areas);
    return async ({ result, update }) => {
      if (result.type === 'success') saved = sent;
      await update({ reset: false });
    };
  }}
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
          <div class="grid gap-3 rounded-md border bg-background p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium"
                >{names[widget.type] ?? widget.type}</span
              >
              <span class="ml-auto flex gap-1">
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
                    oninput={(event) =>
                      setting(widget, 'text', event.currentTarget.value)}
                  />
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">{m.widgetEmpty}</p>
        {/each}
      </CardContent>
    </Card>
  {/each}

  <div><Button type="submit">{m.save}</Button></div>
</form>
