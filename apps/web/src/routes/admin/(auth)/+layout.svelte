<script lang="ts">
  import PrivacyPolicyLink from '#lib/theme/PrivacyPolicyLink.svelte';
  import { provideI18n } from '#lib/i18n/index.js';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  provideI18n(() => data.language);
</script>

<main
  class="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10"
>
  <div class="w-full max-w-md">
    {@render children()}
    <div class="mt-4 text-center">
      <PrivacyPolicyLink policy={data.privacyPolicy} />
    </div>
  </div>
</main>
