import { beforeNavigate } from '$app/navigation';

/**
 * Asks before leaving a page while `isDirty()` holds. Closing the tab or reloading gets the
 * browser's own prompt. Call while the component initialises.
 */
export const confirmLeave = (isDirty: () => boolean, message: () => string) =>
  beforeNavigate((navigation) => {
    // A shallow navigation only rewrites the address (`forgetParams`); nothing is left.
    if (navigation.shallow || !isDirty()) return;
    if (navigation.type === 'leave' || !confirm(message())) navigation.cancel();
  });
