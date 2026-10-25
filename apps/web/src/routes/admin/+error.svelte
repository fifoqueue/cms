<script lang="ts">
  import { resolve } from '$app/paths';
  import ErrorPage from '#lib/components/ErrorPage.svelte';
  import { useI18n } from '#lib/i18n/index.js';

  /** Admin errors render inside the admin layout, so they follow its light/dark choice. */
  const i18n = useI18n();
</script>

<ErrorPage
  home={resolve('/admin/(app)')}
  homeLabel={i18n.m.errorPageDashboard}
/>
