<script lang="ts">
  import { page } from '$app/state';
  import ErrorView from '#lib/components/ErrorView.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { errorCopy } from '#lib/error-copy.js';
  import { useI18n } from '#lib/i18n/index.js';

  /** A full-screen error outside the site theme (the root fallback and the admin area). */
  let { home, homeLabel }: { home: string; homeLabel: string } = $props();

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const copy = $derived(errorCopy(m, page.status, page.error?.message ?? ''));
</script>

<svelte:head>
  <title>{copy.title}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="@container grid min-h-svh place-items-center bg-background px-6 py-16 text-foreground"
>
  <ErrorView status={page.status} title={copy.title} help={copy.help}>
    <Button href={home}>{homeLabel}</Button>
    <Button variant="outline" onclick={() => history.back()}
      >{m.errorPageBack}</Button
    >
  </ErrorView>
</main>
