<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { can } from '@cms/sdk/capabilities';
  import { resolve } from '$app/paths';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  import CropBox from '#lib/admin/CropBox.svelte';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { typeLabel, useI18n } from '#lib/i18n/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const media = $derived(data.media);
  const editable = $derived(
    media.uploaderId === data.user.id || can(data.user, 'media.manage'),
  );
  const size = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  let copied = $state(false);
  const copyUrl = async () => {
    await navigator.clipboard
      .writeText(new URL(media.url, location.origin).href)
      .catch(() => null);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  };

  // The crop box and the number fields edit the same rectangle, in original pixels.
  let cropping = $state(false);
  // svelte-ignore state_referenced_locally
  let crop = $state({
    left: 0,
    top: 0,
    width: data.media.width ?? 1,
    height: data.media.height ?? 1,
  });
  let aspect = $state('');
  // Previous/Next reuse this page: a new attachment starts without the old one's crop.
  let cropFor = untrack(() => data.media.id);
  $effect(() => {
    const { id, width, height } = media;
    if (id === cropFor) return;
    cropFor = id;
    cropping = false;
    aspect = '';
    crop = { left: 0, top: 0, width: width ?? 1, height: height ?? 1 };
  });
  const ratio = $derived(
    aspect === 'original' && media.width && media.height
      ? media.width / media.height
      : aspect
        ? Number(aspect.split(':')[0]) / Number(aspect.split(':')[1])
        : null,
  );

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
</script>

<svelte:head><title>{media.filename}</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-semibold break-all">{media.filename}</h1>
  <nav class="flex gap-2" aria-label={m.mediaDetails}>
    {#if data.context.newerId}<Button
        variant="outline"
        size="sm"
        href={resolve('/admin/(app)/media/[id]', {
          id: data.context.newerId,
        })}><ChevronLeft class="size-4" />{m.previous}</Button
      >{/if}
    {#if data.context.olderId}<Button
        variant="outline"
        size="sm"
        href={resolve('/admin/(app)/media/[id]', {
          id: data.context.olderId,
        })}>{m.next}<ChevronRight class="size-4" /></Button
      >{/if}
  </nav>
</div>
<FormMessage {form} />

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <div class="overflow-hidden rounded-md border bg-background">
    {#if media.kind === 'image' && cropping && media.width && media.height}
      <div class="p-2 text-center">
        <CropBox
          src={media.variants.find((variant) => variant.name === 'large')
            ?.url ?? media.url}
          alt={media.alt}
          width={media.width}
          height={media.height}
          bind:crop
          {ratio}
          label={m.mediaCrop}
        />
      </div>
    {:else if media.kind === 'image'}
      <img
        src={media.variants.find((variant) => variant.name === 'large')?.url ??
          media.url}
        alt={media.alt}
        class="mx-auto max-h-[70vh] object-contain"
      />
    {:else if media.kind === 'audio'}
      <audio src={media.url} controls class="w-full"></audio>
    {:else if media.kind === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={media.url} controls class="w-full"></video>
    {:else}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a media file, not an app route -->
      <a href={media.url} target="_blank" class="block p-6 underline"
        >{media.filename}</a
      >
    {/if}
  </div>

  <div class="space-y-6">
    <Card>
      <CardContent class="space-y-2 pt-6 text-sm">
        <p>
          <span class="text-muted-foreground">{m.mediaUrl}:</span>
          <code class="break-all select-all">{media.url}</code>
        </p>
        <Button variant="outline" size="sm" onclick={copyUrl}
          >{copied ? m.copied : m.mediaCopyUrl}</Button
        >
        <p>
          <span class="text-muted-foreground">{m.mediaMime}:</span>
          {media.mime}
        </p>
        <p>
          <span class="text-muted-foreground">{m.mediaUploadedOn}:</span>
          {new Date(media.createdAt).toLocaleString(i18n.language)}
        </p>
        <p>
          <span class="text-muted-foreground">{m.mediaSize}:</span>
          {size(media.size)}
        </p>
        {#if media.width && media.height}
          <p>
            <span class="text-muted-foreground">{m.mediaDimensions}:</span>
            {media.width} × {media.height}
          </p>
        {/if}
        <p>
          <span class="text-muted-foreground">{m.mediaUploadedBy}:</span>
          {media.uploaderName || m.none}
        </p>
        <p>{m.mediaUsed(media.usageCount)}</p>
        {#if data.context.usedIn.length}
          <ul class="list-disc pl-5">
            {#each data.context.usedIn as entry (entry.id)}
              <li>
                <a
                  href={resolve('/admin/(app)/content/[id]', { id: entry.id })}
                  class="underline">{entry.title}</a
                >
                <span class="text-muted-foreground"
                  >({typeLabel(m, entry.type)})</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </CardContent>
    </Card>

    {#if editable}
      {#if media.kind === 'image' && media.mime !== 'image/gif'}
        <Card>
          <CardHeader><CardTitle>{m.mediaEditImage}</CardTitle></CardHeader>
          <CardContent>
            <form method="POST" action="?/edit" use:enhance class="space-y-3">
              <p class="text-sm text-muted-foreground">{m.mediaEditCopyHelp}</p>
              <label class="flex items-center gap-2"
                ><input
                  type="checkbox"
                  name="crop"
                  bind:checked={cropping}
                />{m.mediaCrop}</label
              >
              {#if cropping}
                <p class="text-xs text-muted-foreground">{m.mediaCropHelp}</p>
                <label class="grid gap-1 text-sm"
                  >{m.mediaAspect}
                  <select
                    bind:value={aspect}
                    class="rounded border bg-background p-2"
                  >
                    <option value="">{m.mediaAspectFree}</option>
                    <option value="original">{m.mediaAspectOriginal}</option>
                    {#each ['1:1', '4:3', '3:2', '16:9', '3:4', '9:16'] as option (option)}
                      <option value={option}>{option}</option>
                    {/each}
                  </select>
                </label>
                <div class="grid grid-cols-2 gap-2">
                  {#each ['left', 'top', 'width', 'height'] as const as key (key)}
                    <label class="grid gap-1 text-sm"
                      >{m.mediaCropField(key)}
                      <Input
                        type="number"
                        name={key}
                        min={key === 'left' || key === 'top' ? 0 : 1}
                        bind:value={crop[key]}
                      />
                    </label>
                  {/each}
                </div>
              {/if}
              <label class="grid gap-1"
                >{m.mediaRotate}
                <select name="rotate" class="rounded border bg-background p-2">
                  {#each [0, 90, 180, 270] as angle (angle)}<option
                      value={angle}>{angle}°</option
                    >{/each}
                </select>
              </label>
              <label class="flex items-center gap-2"
                ><input
                  type="checkbox"
                  name="flop"
                />{m.mediaFlipHorizontal}</label
              >
              <label class="flex items-center gap-2"
                ><input
                  type="checkbox"
                  name="flip"
                />{m.mediaFlipVertical}</label
              >
              <Button type="submit">{m.mediaSaveCopy}</Button>
            </form>
          </CardContent>
        </Card>
      {/if}
      <Card>
        <CardHeader><CardTitle>{m.edit}</CardTitle></CardHeader>
        <CardContent>
          <form
            method="POST"
            action="?/save"
            use:enhance={() =>
              ({ update }) =>
                update({ reset: false })}
            class="space-y-4"
          >
            <div class="grid gap-2">
              <Label for="alt">{m.mediaAlt}</Label>
              <Input
                id="alt"
                name="alt"
                maxlength={500}
                value={media.alt}
                aria-describedby="alt-help"
              />
              <p id="alt-help" class="text-xs text-muted-foreground">
                {m.mediaAltHelp}
              </p>
            </div>
            <div class="grid gap-2">
              <Label for="title">{m.privacyMediaTitle}</Label>
              <Input
                id="title"
                name="title"
                maxlength={255}
                value={media.title}
              />
              <Label for="description">{m.privacyMediaDescription}</Label>
              <Textarea
                id="description"
                name="description"
                maxlength={10000}
                value={media.description}
              />
              <Label for="caption">{m.mediaCaption}</Label>
              <Textarea
                id="caption"
                name="caption"
                maxlength={2000}
                value={media.caption}
              />
            </div>
            <Button type="submit">{m.save}</Button>
          </form>
        </CardContent>
      </Card>

      <form
        method="POST"
        action="?/delete"
        use:enhance={confirmDelete}
        class="space-y-2"
      >
        {#if media.usageCount}
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="force" />
            {m.mediaDeleteUsed}
          </label>
        {/if}
        <Button type="submit" variant="destructive">{m.delete}</Button>
      </form>
    {/if}
  </div>
</div>
