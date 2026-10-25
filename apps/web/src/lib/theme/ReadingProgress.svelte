<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { default as ChevronUp } from '@lucide/svelte/icons/chevron-up';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * Back-to-top button for entry pages. Its ring shows reading progress
   * through the entry body (`[data-entry-body]`): 0 until the body's top reaches the top of the
   * viewport, 1 once the body's end is in view (its bottom at or above the viewport's bottom).
   * Without a body the whole document counts. Hidden until the reader has scrolled `SHOW_AFTER`
   * pixels, so pages that do not scroll never show it. While the comments bulk bar is open it
   * rises above it, using the `--cms-bulk-bar-offset` the bar publishes.
   */
  const SHOW_AFTER = 240;
  /**
   * 1rem from the corner (2rem on wide screens, `--cms-back-to-top-gap`), above the safe area
   * and 0.75rem above the bulk bar's top edge while it is open.
   */
  const BOTTOM =
    'max(var(--cms-back-to-top-gap, 1rem), env(safe-area-inset-bottom), calc(var(--cms-bulk-bar-offset, 0px) + 0.75rem))';
  const RIGHT =
    'max(var(--cms-back-to-top-gap, 1rem), env(safe-area-inset-right))';

  const i18n = useI18n();
  const m = $derived(i18n.m);

  let progress = $state(0);
  let visible = $state(false);
  let frame = 0;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const findBody = () =>
    document.querySelector<HTMLElement>('[data-entry-body]');

  let observed: HTMLElement | null = null;
  let resizes: ResizeObserver | undefined;

  const measure = () => {
    frame = 0;
    const y = window.scrollY;
    const view = window.innerHeight;
    const body = findBody();
    if (body) {
      const rect = body.getBoundingClientRect();
      const start = rect.top + y;
      const end = rect.bottom + y - view;
      progress = clamp(
        end > start ? (y - start) / (end - start) : y >= end ? 1 : 0,
      );
    } else {
      const end = document.documentElement.scrollHeight - view;
      progress = end > 0 ? clamp(y / end) : 0;
    }
    visible = y > SHOW_AFTER;
    // Client navigation can bring a new body; observe the current one.
    if (body !== observed) {
      resizes?.disconnect();
      if (body) resizes?.observe(body);
      observed = body;
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  onMount(() => {
    // Late images and embeds change the body's height without scrolling.
    resizes = new ResizeObserver(schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizes?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  });

  afterNavigate(schedule);

  /**
   * Scrolls to the top of the page (so a sticky header never covers the start)
   * and moves focus to the main region, so keyboard focus does not stay on the now hidden button.
   */
  const toTop = () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    const target =
      document.getElementById('main') ??
      findBody() ??
      document.querySelector<HTMLElement>('.cms-site');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    // Only this programmatic focus hides the outline; the skip link keeps its own behaviour.
    target.dataset.cmsBackToTop = '';
    target.addEventListener('blur', () => delete target.dataset.cmsBackToTop, {
      once: true,
    });
    target.focus({ preventScroll: true });
  };
</script>

<!-- A 52px ring (border color, progress in the accent) around a 48px disc
     on the layout color that darkens on hover, with an upward chevron. -->
<button
  type="button"
  aria-label={m.themeBackToTop}
  title={m.themeBackToTop}
  onclick={toTop}
  class="group/top fixed z-30 grid size-[52px] place-items-center rounded-full text-foreground transition-[opacity,transform,visibility,bottom] duration-250 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none print:hidden @min-[62rem]:[--cms-back-to-top-gap:2rem] {visible
    ? 'visible translate-y-0 opacity-100'
    : 'pointer-events-none invisible translate-y-[15px] opacity-0'}"
  style:bottom={BOTTOM}
  style:right={RIGHT}
>
  <span
    class="absolute inset-[2px] rounded-full bg-card transition-colors duration-250 group-hover/top:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--card))]"
    aria-hidden="true"
  ></span>
  <svg
    class="absolute inset-0 size-full -rotate-90"
    viewBox="0 0 52 52"
    aria-hidden="true"
  >
    <circle
      cx="26"
      cy="26"
      r="24"
      fill="none"
      stroke-width="2"
      class="stroke-border"
    />
    <circle
      cx="26"
      cy="26"
      r="24"
      fill="none"
      stroke-width="2"
      pathLength="100"
      stroke-dasharray="100"
      stroke-dashoffset={100 - progress * 100}
      class="stroke-primary"
    />
  </svg>
  <ChevronUp class="relative size-6" aria-hidden="true" />
</button>

<style>
  :global([data-cms-back-to-top]:focus) {
    outline: none;
  }
</style>
