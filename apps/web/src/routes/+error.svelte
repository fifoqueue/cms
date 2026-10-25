<script lang="ts">
  import { resolve } from '$app/paths';
  import ErrorPage from '#lib/components/ErrorPage.svelte';
  import { useI18n } from '#lib/i18n/index.js';

  /** Errors no layout below caught, such as a site layout that failed to load. */
  const i18n = useI18n();
</script>

<ErrorPage home={resolve('/(site)')} homeLabel={i18n.m.errorPageHome} />
