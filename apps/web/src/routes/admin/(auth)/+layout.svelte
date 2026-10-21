<script lang="ts">
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<main
  class="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10"
>
  <div class="w-full max-w-md">
    {@render children()}
  </div>
</main>
