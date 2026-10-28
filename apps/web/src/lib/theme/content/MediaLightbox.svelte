<script lang="ts">
  import { useI18n } from '#lib/i18n/index.js';
  import Lightbox, { type LightboxItem } from '#lib/theme/Lightbox.svelte';

  /**
   * Image blocks inside `container` (the entry's prose, gallery images included) open in a
   * lightbox on click, Enter or Space, with previous/next across the entry's images. Images
   * that carry a link keep their link. `html` re-runs this when the entry changes.
   */
  let {
    container,
    html,
  }: { container: HTMLElement | undefined; html: string } = $props();

  /** Linked images render as `figure > a > img`, so only direct children qualify. */
  const ZOOMABLE = 'figure.cms-image > img';

  const i18n = useI18n();
  const m = $derived(i18n.m);
  let items = $state.raw<LightboxItem[]>([]);
  let index = $state(0);
  let open = $state(false);

  $effect(() => {
    const element = container;
    const label = m.themeLightboxOpen;
    // Another entry (or a re-render) replaces the images, so a viewer left open closes.
    open = false;
    items = [];
    if (!element || !html.includes('<img')) return;
    const images = [...element.querySelectorAll<HTMLImageElement>(ZOOMABLE)];
    if (!images.length) return;
    for (const image of images) {
      image.setAttribute('role', 'button');
      image.setAttribute('tabindex', '0');
      image.setAttribute('aria-haspopup', 'dialog');
      if (!image.alt) image.setAttribute('aria-label', label);
      image.classList.add('cms-zoomable');
    }

    const show = (image: HTMLImageElement) => {
      items = images.map((each) => ({
        src: each.getAttribute('src') ?? '',
        srcset: each.getAttribute('srcset') ?? undefined,
        alt: each.alt,
        caption:
          each
            .closest('figure')
            ?.querySelector(':scope > figcaption')
            ?.textContent?.trim() ?? '',
      }));
      index = images.indexOf(image);
      open = true;
    };
    const target = (event: Event) =>
      event.target instanceof HTMLImageElement &&
      images.includes(event.target)
        ? event.target
        : null;
    const onClick = (event: MouseEvent) => {
      const image = target(event);
      if (image) show(image);
    };
    const onKeydown = (event: KeyboardEvent) => {
      const image = target(event);
      if (!image || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      show(image);
    };
    element.addEventListener('click', onClick);
    element.addEventListener('keydown', onKeydown);
    return () => {
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKeydown);
      for (const image of images) {
        for (const name of ['role', 'tabindex', 'aria-haspopup', 'aria-label'])
          image.removeAttribute(name);
        image.classList.remove('cms-zoomable');
      }
    };
  });
</script>

<Lightbox {items} bind:index bind:open />
