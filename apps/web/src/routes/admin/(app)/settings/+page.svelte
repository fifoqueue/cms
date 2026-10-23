<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import MediaPicker from '#lib/admin/MediaPicker.svelte';
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

  type Chosen = { id: string; url: string } | null;
  // Reset to the saved images whenever the page data changes (after saving).
  let icon = $derived<Chosen>(data.site.icon);
  let logo = $derived<Chosen>(data.site.logo);
  let picking = $state<'icon' | 'logo'>('icon');
  let picker: ReturnType<typeof MediaPicker>;
  const images = $derived([
    {
      key: 'icon' as const,
      label: m.siteIcon,
      help: m.siteIconHelp,
      chosen: icon,
    },
    {
      key: 'logo' as const,
      label: m.siteLogo,
      help: m.siteLogoHelp,
      chosen: logo,
    },
  ]);
</script>

<svelte:head><title>{m.navSettings}</title></svelte:head>

<h1 class="text-2xl font-semibold">{m.navSettings}</h1>
<FormMessage {form} />

<Card>
  <CardHeader><CardTitle>{m.settingsSite}</CardTitle></CardHeader>
  <CardContent>
    <form
      method="POST"
      use:enhance={() =>
        ({ update }) =>
          update({ reset: false })}
      class="space-y-4"
    >
      <div class="grid gap-2">
        <Label for="title">{m.siteTitle}</Label>
        <Input
          id="title"
          name="title"
          required
          maxlength={191}
          value={data.site.title}
        />
      </div>
      <div class="grid gap-2">
        <Label for="description">{m.siteDescription}</Label>
        <Textarea
          id="description"
          name="description"
          maxlength={500}
          value={data.site.description}
        />
      </div>
      <div class="grid gap-2">
        <Label for="locale">{m.siteLocale}</Label>
        <Input
          id="locale"
          name="locale"
          required
          maxlength={35}
          placeholder="en, ko-KR"
          value={data.site.locale}
        />
      </div>
      {#each images as image (image.key)}
        <fieldset class="grid gap-2">
          <legend class="text-sm font-medium">{image.label}</legend>
          <input
            type="hidden"
            name="{image.key}Id"
            value={image.chosen?.id ?? ''}
          />
          <div class="flex flex-wrap items-center gap-3">
            {#if image.chosen}
              <img
                src={image.chosen.url}
                alt=""
                class="size-16 rounded-md border object-contain"
              />
            {:else}
              <p class="text-sm text-muted-foreground">{m.siteImageNone}</p>
            {/if}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() => {
                picking = image.key;
                picker.open();
              }}>{m.mediaChoose}</Button
            >
            {#if image.chosen}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => {
                  if (image.key === 'icon') icon = null;
                  else logo = null;
                }}>{m.remove}</Button
              >
            {/if}
          </div>
          <p class="text-xs text-muted-foreground">{image.help}</p>
        </fieldset>
      {/each}
      <MediaPicker
        bind:this={picker}
        onpick={(media) => {
          const chosen = {
            id: media.id,
            url:
              media.variants.find((variant) => variant.name === 'thumbnail')
                ?.url ?? media.url,
          };
          if (picking === 'icon') icon = chosen;
          else logo = chosen;
        }}
      />
      <Button type="submit">{m.save}</Button>
    </form>
  </CardContent>
</Card>
