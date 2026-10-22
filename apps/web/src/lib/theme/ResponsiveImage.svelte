<script lang="ts">
  interface Props {
    image: {
      url: string;
      alt: string;
      width: number | null;
      height: number | null;
      sizes: { url: string; width: number }[];
    };
    /** CSS `sizes` hint for choosing a candidate. */
    sizes?: string;
    class?: string;
    eager?: boolean;
  }

  let {
    image,
    sizes = '100vw',
    class: className = '',
    eager = false,
  }: Props = $props();

  const srcset = $derived(
    image.sizes.map(({ url, width }) => `${url} ${width}w`).join(', '),
  );
</script>

<img
  src={image.sizes[image.sizes.length - 1]?.url ?? image.url}
  srcset={srcset || undefined}
  {sizes}
  alt={image.alt}
  width={image.width ?? undefined}
  height={image.height ?? undefined}
  loading={eager ? 'eager' : 'lazy'}
  decoding="async"
  class={className}
/>
