<script lang="ts">
  import SignInCallback from '#lib/security/SignInCallback.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<SignInCallback {data} />
