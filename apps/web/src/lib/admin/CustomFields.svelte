<script lang="ts">
  import type { FieldDefinition } from '@cms/sdk';
  import { thumbnailUrl } from '#lib/admin/media-thumbnail.js';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import {
    NativeSelect,
    NativeSelectOption,
  } from '#lib/components/ui/native-select/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { useI18n } from '#lib/i18n/index.js';

  // `field.<key>` inputs read by the server's `readFields`, for entries and terms alike.
  interface Props {
    /** The definitions that apply; renders nothing when empty. */
    fields: FieldDefinition[];
    /** Values to start from, by field key. */
    values: Record<string, unknown>;
    /** Thumbnail addresses of the saved image fields, by field key. */
    images?: Record<string, string>;
    /** Called when an image field changes (text inputs report through the form). */
    onchange?: () => void;
  }

  let { fields, values, images = {}, onchange }: Props = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);

  /** Image field values (media ids) changed in this form, by field key; null removes. */
  let imageFields = $state<Record<string, { id: string; url: string } | null>>(
    {},
  );
  /** The changed image, else the saved one (fields may appear later, e.g. on a type change). */
  const chosenImage = (key: string) => {
    if (key in imageFields) return imageFields[key];
    const id = values[key];
    return typeof id === 'string' ? { id, url: images[key] ?? '' } : null;
  };
  let fieldPicker = $state<ReturnType<typeof MediaPicker>>();
  let pickingField = '';
</script>

{#if fields.length}
  <fieldset class="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
    <legend class="px-1 text-sm font-medium">{m.customFields}</legend>
    {#each fields as field (field.key)}
      {@const id = `field-${field.key}`}
      {@const name = `field.${field.key}`}
      {@const value = values[field.key]}
      <div
        class="grid gap-2 {field.type === 'textarea' ? 'sm:col-span-2' : ''}"
      >
        {#if field.type === 'boolean'}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" {name} checked={value === true} />
            {field.label}
          </label>
        {:else}
          <Label for={id}>{field.label}{field.required ? ' *' : ''}</Label>
          {#if field.type === 'textarea'}
            <Textarea
              {id}
              {name}
              rows={4}
              maxlength={20000}
              required={field.required}
              value={typeof value === 'string' ? value : ''}
            />
          {:else if field.type === 'select'}
            <NativeSelect
              class="w-full"
              {id}
              {name}
              required={field.required}
              value={typeof value === 'string' ? value : ''}
            >
              <NativeSelectOption value="">{m.noChoice}</NativeSelectOption>
              {#each field.options as option (option)}
                <NativeSelectOption value={option}>{option}</NativeSelectOption>
              {/each}
            </NativeSelect>
          {:else if field.type === 'image'}
            {@const chosen = chosenImage(field.key)}
            <input type="hidden" {name} value={chosen?.id ?? ''} />
            {#if chosen?.url}
              <img
                src={chosen.url}
                alt=""
                class="aspect-video w-48 rounded-md border object-cover"
              />
            {/if}
            <div class="flex gap-2">
              <Button
                {id}
                variant="outline"
                size="sm"
                onclick={() => {
                  pickingField = field.key;
                  fieldPicker?.open();
                }}>{m.mediaChoose}</Button
              >
              {#if chosen}
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => {
                    imageFields[field.key] = null;
                    onchange?.();
                  }}>{m.mediaRemoveFeatured}</Button
                >
              {/if}
            </div>
          {:else}
            <Input
              {id}
              {name}
              type={field.type === 'number'
                ? 'number'
                : field.type === 'date'
                  ? 'date'
                  : field.type === 'url'
                    ? 'url'
                    : 'text'}
              step={field.type === 'number' ? 'any' : undefined}
              required={field.required}
              value={value === undefined || value === null ? '' : String(value)}
            />
          {/if}
        {/if}
        {#if field.help}<p class="text-xs text-muted-foreground">
            {field.help}
          </p>{/if}
      </div>
    {/each}
  </fieldset>
  <MediaPicker
    bind:this={fieldPicker}
    onpick={(media) => {
      imageFields[pickingField] = {
        id: media.id,
        url: thumbnailUrl(media),
      };
      onchange?.();
    }}
  />
{/if}
