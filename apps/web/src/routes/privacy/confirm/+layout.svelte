<script lang="ts">
  import '#web/routes/layout.css';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

{@render children()}
