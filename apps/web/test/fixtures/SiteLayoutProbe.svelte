<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import Layout from '#web/routes/(site)/+layout.svelte';
  import DateProbe from '#web-test/fixtures/DateProbe.svelte';

  /** The site layout around a page that shows the date style and catalog it receives. */
  let { data }: { data: ComponentProps<typeof Layout>['data'] } = $props();
</script>

<Layout {data} params={{}}><DateProbe /></Layout>
