import type { Action } from 'svelte/action';

export interface ModalOptions {
  /** Called on Escape; the component closes the panel by removing it. */
  close: () => void;
  /** Elements outside the panel that stay usable while it is open (its toggle button). */
  keep?: (HTMLElement | null | undefined)[];
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes everything outside `allowed` (and the elements on the way to it) inert, from the
 * document body down; returns what to undo. Elements that were inert already stay so.
 */
export const inertOutside = (root: Element, allowed: Element[]) => {
  const changed: Element[] = [];
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (allowed.includes(child)) continue;
      if (allowed.some((element) => child.contains(element))) walk(child);
      else if (!child.hasAttribute('inert')) {
        child.setAttribute('inert', '');
        changed.push(child);
      }
    }
  };
  walk(root);
  return () => {
    for (const element of changed) element.removeAttribute('inert');
  };
};

/**
 * An accessible modal panel for theme blocks (the off-canvas menu, the search panel), mounted
 * while it is open: the rest of the page becomes inert (so focus and pointer stay in the panel),
 * the page stops scrolling, focus moves to `[data-autofocus]` (else the first control) and goes
 * back where it was when the panel closes; Escape asks it to close. It stays inside the site
 * root, so the theme's colors and container queries still apply (unlike a portalled dialog).
 */
export const modal: Action<HTMLElement, ModalOptions> = (node, options) => {
  let current = options;
  const previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const restore = inertOutside(document.body, [
    node,
    ...(current.keep ?? []).filter((element) => element instanceof Element),
  ]);
  const root = document.documentElement;
  const overflow = root.style.overflow;
  root.style.overflow = 'hidden';
  (
    node.querySelector<HTMLElement>('[data-autofocus]') ??
    node.querySelector<HTMLElement>(FOCUSABLE)
  )?.focus();
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    current.close();
  };
  document.addEventListener('keydown', onKeydown);
  return {
    update(next) {
      current = next;
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      restore();
      root.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    },
  };
};
