<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '$app/forms';
  import { can } from '@cms/sdk/capabilities';
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
  import { useI18n } from '#lib/i18n/index.js';
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

  const confirmDelete: SubmitFunction = ({ cancel }) => {
    if (!confirm(m.confirmDelete)) cancel();
  };
</script>

<svelte:head><title>{media.filename}</title></svelte:head>

<h1 class="text-2xl font-semibold break-all">{media.filename}</h1>
<FormMessage {form} />

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <div class="overflow-hidden rounded-md border bg-background">
    {#if media.kind === 'image'}
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
                ><input type="checkbox" name="crop" />{m.mediaCrop}</label
              >
              <div class="grid grid-cols-2 gap-2">
                {#each ['left', 'top', 'width', 'height'] as key (key)}
                  <label class="grid gap-1 text-sm"
                    >{m.mediaCropField(key)}
                    <Input
                      type="number"
                      name={key}
                      min={key === 'left' || key === 'top' ? 0 : 1}
                      value={key === 'width'
                        ? (media.width ?? 1)
                        : key === 'height'
                          ? (media.height ?? 1)
                          : 0}
                    />
                  </label>
                {/each}
              </div>
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
