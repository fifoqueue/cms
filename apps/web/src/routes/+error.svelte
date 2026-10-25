<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { catalogMessage } from '#lib/admin/form-errors.js';
  import { useI18n } from '#lib/i18n/index.js';

  const i18n = useI18n();
  const message = $derived(page.error?.message ?? '');
</script>

<main class="mx-auto max-w-xl px-4 py-24 text-center">
  <p class="text-6xl font-bold">{page.status}</p>
  <p class="mt-4 text-muted-foreground">
    {catalogMessage(i18n.m, message) ?? message}
  </p>
  <a href={resolve('/(site)')} class="mt-8 inline-block underline"
    >{i18n.m.themeHome}</a
  >
</main>
