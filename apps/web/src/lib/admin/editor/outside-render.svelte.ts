/**
 * Runs a state update now, or right after Svelte finishes the update it is running. Editor
 * transactions can arrive mid-update: when Svelte removes a focused editor (a `{#key}` remount
 * or a hot reload), the browser blurs it and the editor's blur handler dispatches one, while
 * changing state there is forbidden.
 */
export const outsideRender = (update: () => void) => {
  if ($effect.tracking()) queueMicrotask(update);
  else update();
};
