<script lang="ts">
  import { tick } from 'svelte';
  import { default as TableOfContents } from '@lucide/svelte/icons/table-of-contents';
  import { default as X } from '@lucide/svelte/icons/x';
  import { useI18n } from '#lib/i18n/index.js';
  import { focusHeading, fragmentTarget } from '#lib/theme/content/toc.js';

  /**
   * A floating button (like tocer's "switch" fixed TOC) that opens the outline of the first
   * in-content table of contents inside `container` (the entry's prose). It shows only while
   * that TOC has scrolled out above the sticky-header line (`--cms-toc-offset`, set by
   * `enhanceToc`) and the content's end is still below the middle of the viewport, so it is
   * gone at the comments and footer. The current heading mirrors the in-content TOC's
   * `aria-current`. `html` re-runs this when the entry changes.
   */
  let {
    container,
    html,
  }: { container: HTMLElement | undefined; html: string } = $props();

  type Item = { href: string; text: string; children: Item[] };

  /**
   * Bottom-left, mirroring the back-to-top button's gaps (`ReadingProgress`, bottom-right), above
   * the safe area and the comments bulk bar (`--cms-bulk-bar-offset`) while it is open.
   */
  const BOTTOM =
    'max(var(--cms-back-to-top-gap, 1rem), env(safe-area-inset-bottom), calc(var(--cms-bulk-bar-offset, 0px) + 0.75rem))';
  const LEFT =
    'max(var(--cms-back-to-top-gap, 1rem), env(safe-area-inset-left))';

  const i18n = useI18n();
  const m = $derived(i18n.m);
  const id = $props.id();

  let items = $state<Item[]>([]);
  let title = $state('');
  let current = $state<string | null>(null);
  let visible = $state(false);
  let open = $state(false);
  let button = $state<HTMLButtonElement>();
  let panel = $state<HTMLElement>();
  const shown = $derived(items.length > 0 && visible);
  let root: HTMLElement | undefined;

  const outline = (list: Element | null): Item[] =>
    [...(list?.children ?? [])].flatMap((li) => {
      const link = li.querySelector<HTMLAnchorElement>(':scope > a[href^="#"]');
      if (!link) return [];
      return [
        {
          href: link.getAttribute('href')!,
          text: link.textContent?.trim() ?? '',
          children: outline(li.querySelector(':scope > ol')),
        },
      ];
    });

  $effect(() => {
    void html;
    const element = container;
    items = [];
    open = false;
    visible = false;
    root = element;
    if (!element) return;
    const source = element.querySelector<HTMLElement>('.cms-toc');
    const list = source?.querySelector('ol') ?? null;
    if (!source || !source.querySelector('a[href^="#"]')) return;
    const view = element.ownerDocument.defaultView!;
    items = outline(list);
    title =
      source.getAttribute('aria-label') ||
      source
        .querySelector(':scope summary, :scope .cms-toc-title')
        ?.textContent?.trim() ||
      m.contentTocDefaultTitle;

    const mirror = () => {
      current =
        source.querySelector('a[aria-current]')?.getAttribute('href') ?? null;
    };
    const marks = new view.MutationObserver(mirror);
    marks.observe(source, {
      attributes: true,
      attributeFilter: ['aria-current'],
      subtree: true,
    });
    mirror();

    let frame = 0;
    const measure = () => {
      frame = 0;
      const offset =
        Number.parseFloat(
          view.getComputedStyle(element).getPropertyValue('--cms-toc-offset'),
        ) || 0;
      visible =
        source.getBoundingClientRect().bottom <= offset &&
        element.getBoundingClientRect().bottom > view.innerHeight / 2;
      // The panel never outlives its button (past the content's end, back above the TOC).
      if (!visible && open) close(true);
    };
    const schedule = () => {
      if (!frame) frame = view.requestAnimationFrame(measure);
    };
    view.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      marks.disconnect();
      view.removeEventListener('scroll', schedule);
      view.removeEventListener('resize', schedule);
      if (frame) view.cancelAnimationFrame(frame);
    };
  });

  /** Opening moves focus to the current heading's link, so arrows/Tab start where the reader is. */
  const toggle = () => {
    open = !open;
    if (!open) return;
    void tick().then(() => {
      const links = panel?.querySelectorAll<HTMLAnchorElement>('a') ?? [];
      const target =
        [...links].find((link) => link.hasAttribute('aria-current')) ??
        links[0];
      target?.focus();
    });
  };

  /**
   * With `restore`, focus inside the panel goes back to the button, or, when the button is
   * hidden, to the current heading; otherwise it stays where the reader put it.
   */
  const close = (restore: boolean) => {
    const active = panel?.ownerDocument.activeElement;
    const within = !!active && (panel?.contains(active) || active === button);
    open = false;
    if (!restore || !within) return;
    if (visible) button?.focus();
    else {
      const heading = current && root ? fragmentTarget(current, root) : null;
      if (heading) focusHeading(heading);
    }
  };

  $effect(() => {
    if (!open) return;
    const view = button!.ownerDocument.defaultView!;
    const inside = (node: EventTarget | null) =>
      node instanceof Node &&
      (panel?.contains(node) === true || button?.contains(node) === true);
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    const pointerdown = (event: PointerEvent) => {
      if (!inside(event.target)) close(false);
    };
    const focusin = (event: FocusEvent) => {
      if (!inside(event.target)) close(false);
    };
    view.addEventListener('keydown', keydown);
    view.addEventListener('pointerdown', pointerdown, true);
    view.addEventListener('focusin', focusin);
    return () => {
      view.removeEventListener('keydown', keydown);
      view.removeEventListener('pointerdown', pointerdown, true);
      view.removeEventListener('focusin', focusin);
    };
  });

  /** The link scrolls natively (heading `scroll-margin-top` clears sticky headers); focus follows. */
  const follow = (event: MouseEvent) => {
    const link = event.currentTarget as HTMLAnchorElement;
    open = false;
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const heading = root
      ? fragmentTarget(link.getAttribute('href')!, root)
      : null;
    if (heading) focusHeading(heading);
  };
</script>

{#snippet list(entries: Item[])}
  <ol>
    {#each entries as item (item.href)}
      <li>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- page-local "#heading" fragments copied from the in-content TOC -->
        <a
          href={item.href}
          aria-current={item.href === current ? 'location' : undefined}
          onclick={follow}>{item.text}</a
        >
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {#if item.children.length}{@render list(item.children)}{/if}
      </li>
    {/each}
  </ol>
{/snippet}

{#if items.length}
  <button
    bind:this={button}
    type="button"
    aria-label={m.themeTocShow}
    title={m.themeTocShow}
    aria-expanded={open}
    aria-controls="{id}-panel"
    onclick={toggle}
    class="cms-floating-toc-button fixed z-30 grid size-11 place-items-center rounded-full border bg-card text-foreground shadow-md transition-[opacity,transform,visibility,background-color] duration-250 hover:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--card))] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none print:hidden @min-[62rem]:[--cms-back-to-top-gap:2rem] {shown
      ? 'visible translate-y-0 opacity-100'
      : 'pointer-events-none invisible translate-y-[15px] opacity-0'}"
    style:bottom={BOTTOM}
    style:left={LEFT}
  >
    <TableOfContents class="size-5" aria-hidden="true" />
  </button>
  <nav
    bind:this={panel}
    id="{id}-panel"
    aria-labelledby="{id}-title"
    hidden={!open}
    class="cms-floating-toc fixed z-40 flex max-h-[min(28rem,calc(100dvh-8rem))] w-[min(20rem,calc(100vw-2rem))] flex-col rounded-[var(--radius)] border bg-card text-card-foreground shadow-lg print:hidden @min-[62rem]:[--cms-back-to-top-gap:2rem]"
    style:bottom="calc({BOTTOM} + 3.25rem)"
    style:left={LEFT}
  >
    <div
      class="flex items-center justify-between gap-2 border-b py-1 ps-4 pe-1"
    >
      <p id="{id}-title" class="m-0 text-sm font-semibold">{title}</p>
      <button
        type="button"
        aria-label={m.themeTocClose}
        title={m.themeTocClose}
        onclick={() => close(true)}
        class="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--card))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
    <div class="overflow-y-auto overscroll-contain px-2 py-2 text-sm">
      {@render list(items)}
    </div>
  </nav>
{/if}
