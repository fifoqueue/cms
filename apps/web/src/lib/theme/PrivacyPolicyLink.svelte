<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Path } from '$app/types';
  import { useI18n } from '#lib/i18n/index.js';
  let { policy }: { policy?: { title: string; path: string } | null } =
    $props();
  const i18n = useI18n();
</script>

{#if policy}<a
    href={resolve(policy.path as Path)}
    class="cms-privacy-policy-link text-sm text-primary underline-offset-4 hover:underline"
    >{i18n.m.privacyPolicy}</a
  >{/if}
