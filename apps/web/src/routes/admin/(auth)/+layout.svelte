<script lang="ts">
  import { provideI18n } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  provideI18n(() => data.language);
</script>

<!-- Pages draw themselves in `AuthShell`, like the public sign-in page. -->
<div class="flex min-h-dvh flex-col">
  {@render children()}
</div>
