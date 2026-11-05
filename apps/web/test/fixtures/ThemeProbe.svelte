<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import type { Block, PublicImage } from '@cms/sdk';
  import type { ThemePage } from '#lib/theme/template.js';
  import Layout from '#web/routes/(site)/+layout.svelte';
  import TemplateView from '#lib/theme/TemplateView.svelte';

  let {
    data,
    page,
    template,
    images,
  }: {
    data: ComponentProps<typeof Layout>['data'];
    page: ThemePage;
    template: Block[];
    images: Record<string, PublicImage>;
  } = $props();
</script>

<Layout {data} params={{}}>
  <TemplateView
    data={{
      ...data,
      template,
      images,
      related: { 'category:3': [{ title: 'Related entry', path: '/related' }] },
    }}
    {page}
  />
</Layout>
