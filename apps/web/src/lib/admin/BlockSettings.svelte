<script lang="ts">
  import { BLOCKS, MEDIA_IMAGE } from '@cms/sdk';
  import type { Block, BlockAttr } from '@cms/sdk';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** The selected block's attributes (WordPress block settings sidebar). Edits it in place. */
  interface Props {
    block: Block;
    /** Palette slugs for color settings. */
    colors: { slug: string; name: string }[];
    /** Template part slugs for the template-part block. */
    parts: string[];
  }

  let { block, colors, parts }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const attrs = $derived(
    Object.entries(BLOCKS[block.name].attrs) as [string, BlockAttr][],
  );
  const values = $derived(block.attrs as Record<string, unknown>);
  const id = $props.id();
  let picker: ReturnType<typeof MediaPicker>;
  let picking = '';

  const set = (key: string, value: unknown) => {
    (block.attrs as Record<string, unknown>)[key] = value;
  };
  const isMedia = (attr: BlockAttr) =>
    attr.type === 'text' && attr.pattern === MEDIA_IMAGE;
</script>

{#if attrs.length}
  <div class="grid gap-3">
    {#each attrs as [key, attr] (key)}
      {#if attr.type === 'boolean'}
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values[key] === true}
            onchange={(event) => set(key, event.currentTarget.checked)}
          />
          {m.blockAttr(key)}
        </label>
      {:else if isMedia(attr)}
        <div class="grid gap-1.5 text-sm">
          <span class="font-medium">{m.blockAttr(key)}</span>
          {#if values[key]}
            <img
              src={values[key] as string}
              alt=""
              class="max-h-32 w-full rounded-md border object-cover"
            />
          {/if}
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() => {
                picking = key;
                picker.open();
              }}>{m.mediaChoose}</Button
            >
            {#if values[key]}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => set(key, '')}>{m.remove}</Button
              >
            {/if}
          </div>
        </div>
      {:else}
        <label class="grid gap-1.5 text-sm" for="{id}-{key}">
          <span class="font-medium">{m.blockAttr(key)}</span>
          {#if attr.type === 'enum'}
            <NativeSelect
              id="{id}-{key}"
              class="w-full"
              value={values[key] as string}
              onchange={(event) => set(key, event.currentTarget.value)}
            >
              {#each attr.options as option (option)}
                <NativeSelectOption value={option}
                  >{m.blockOption(option)}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          {:else if attr.type === 'color'}
            <NativeSelect
              id="{id}-{key}"
              class="w-full"
              value={values[key] as string}
              onchange={(event) => set(key, event.currentTarget.value)}
            >
              <NativeSelectOption value=""
                >{m.editorColorDefault}</NativeSelectOption
              >
              {#each colors as color (color.slug)}
                <NativeSelectOption value={color.slug}
                  >{color.name}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          {:else if attr.type === 'number'}
            <Input
              id="{id}-{key}"
              type="number"
              min={attr.min}
              max={attr.max}
              value={values[key] as number}
              oninput={(event) =>
                set(key, Math.round(Number(event.currentTarget.value) || 0))}
            />
          {:else if block.name === 'template-part' && key === 'slug'}
            <NativeSelect
              id="{id}-{key}"
              class="w-full"
              value={values[key] as string}
              onchange={(event) => set(key, event.currentTarget.value)}
            >
              {#each parts as part (part)}
                <NativeSelectOption value={part}>{part}</NativeSelectOption>
              {/each}
            </NativeSelect>
          {:else if key === 'text' && attr.max > 200}
            <textarea
              id="{id}-{key}"
              rows="4"
              maxlength={attr.max}
              value={values[key] as string}
              oninput={(event) => set(key, event.currentTarget.value)}
              class="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            ></textarea>
          {:else}
            <Input
              id="{id}-{key}"
              value={values[key] as string}
              maxlength={attr.max}
              oninput={(event) => set(key, event.currentTarget.value)}
            />
          {/if}
        </label>
      {/if}
    {/each}
  </div>
{:else}
  <p class="text-sm text-muted-foreground">{m.editorNoSettings}</p>
{/if}

<MediaPicker
  bind:this={picker}
  onpick={(media) => {
    if (picking) set(picking, media.url);
    if (picking === 'src' && 'alt' in block.attrs && !values.alt)
      set('alt', media.alt);
  }}
/>
