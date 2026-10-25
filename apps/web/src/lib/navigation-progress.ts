/** Navigations quicker than this never show the bar, so fast pages do not flash it. */
export const PROGRESS_DELAY_MS = 150;
/** How often the bar creeps forward while the next page loads. */
export const PROGRESS_TICK_MS = 200;
/** Where the bar starts once shown, and the point it never passes before the page arrives. */
export const PROGRESS_START = 0.08;
export const PROGRESS_LIMIT = 0.9;

/** One step forward: a tenth of the remaining way to the limit, so it slows as it nears it. */
export const advanceProgress = (value: number) =>
  Math.min(PROGRESS_LIMIT, value + (PROGRESS_LIMIT - value) * 0.1);
