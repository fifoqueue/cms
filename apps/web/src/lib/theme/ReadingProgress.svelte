<script lang="ts">
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { ArrowUp } from '@lucide/svelte';
  import { useI18n } from '#lib/i18n/index.js';

  /**
   * Back-to-top button for entry pages (Swyft's scroll-to-top). Its ring shows reading progress
   * through the entry body (`[data-entry-body]`): 0 until the body's top reaches the top of the
   * viewport, 1 once the body's end is in view (its bottom at or above the viewport's bottom).
   * Without a body the whole document counts. Hidden until the reader has scrolled `SHOW_AFTER`
   * pixels, so pages that do not scroll never show it. While the comments bulk bar is open it
   * rises above it, using the `--cms-bulk-bar-offset` the bar publishes.
   */
  const SHOW_AFTER = 240;
  /** Above the safe area, and 0.75rem above the bulk bar's top edge while it is open. */
  const BOTTOM =
    'max(1rem, env(safe-area-inset-bottom), calc(var(--cms-bulk-bar-offset, 0px) + 0.75rem))';

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
   * Scrolls to the top of the page (as Swyft does, so a sticky header never covers the start)
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

<button
  type="button"
  aria-label={m.themeBackToTop}
  title={m.themeBackToTop}
  onclick={toTop}
  class="fixed right-[max(1rem,env(safe-area-inset-right))] z-30 grid size-12 place-items-center rounded-full bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-[opacity,transform,visibility,bottom] duration-200 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none print:hidden {visible
    ? 'visible translate-y-0 opacity-100'
    : 'pointer-events-none invisible translate-y-2 opacity-0'}"
  style:bottom={BOTTOM}
>
  <svg
    class="absolute inset-0 size-full -rotate-90"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <circle
      cx="24"
      cy="24"
      r="22"
      fill="none"
      stroke-width="2.5"
      class="stroke-border"
    />
    <circle
      cx="24"
      cy="24"
      r="22"
      fill="none"
      stroke-width="2.5"
      stroke-linecap={progress > 0 ? 'round' : 'butt'}
      pathLength="100"
      stroke-dasharray="100"
      stroke-dashoffset={100 - progress * 100}
      class="stroke-primary"
    />
  </svg>
  <ArrowUp class="relative size-5" aria-hidden="true" />
</button>

<style>
  :global([data-cms-back-to-top]:focus) {
    outline: none;
  }
</style>
