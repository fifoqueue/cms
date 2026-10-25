<script lang="ts">
  import { navigating } from '$app/state';
  import {
    PROGRESS_DELAY_MS,
    PROGRESS_START,
    PROGRESS_TICK_MS,
    advanceProgress,
  } from '#lib/navigation-progress.js';

  /**
   * A thin bar across the top while the next page loads. It appears only when a navigation takes
   * longer than `PROGRESS_DELAY_MS`, creeps towards `PROGRESS_LIMIT`, fills when the page arrives
   * and then fades. Decorative: SvelteKit already announces the new page to assistive technology.
   */
  const FINISH_MS = 250;

  let value = $state(0);
  let shown = $state(false);
  /** The fade after a finished navigation; a navigation starting meanwhile cancels it. */
  let finishing: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!navigating.to) return;
    clearTimeout(finishing);
    let tick: ReturnType<typeof setInterval> | undefined;
    const delay = setTimeout(() => {
      value = PROGRESS_START;
      shown = true;
      tick = setInterval(
        () => (value = advanceProgress(value)),
        PROGRESS_TICK_MS,
      );
    }, PROGRESS_DELAY_MS);
    // Runs when this navigation ends (or another replaces it).
    return () => {
      clearTimeout(delay);
      clearInterval(tick);
      if (!shown) return;
      value = 1;
      finishing = setTimeout(() => {
        shown = false;
        value = 0;
      }, FINISH_MS);
    };
  });
</script>

<div
  aria-hidden="true"
  class="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-200 motion-reduce:transition-none print:hidden {shown
    ? 'opacity-100'
    : 'opacity-0'}"
>
  <div
    class="h-full origin-left bg-primary shadow-[0_0_6px_var(--color-primary)] transition-transform duration-200 ease-out motion-reduce:transition-none"
    style:transform="scaleX({value})"
  ></div>
</div>
