/**
 * The one form field the server reads the solved captcha from (`visitorOf`), whichever
 * provider produced it: `Captcha.svelte` copies the provider's response field into it.
 */
export const CAPTCHA_TOKEN_FIELD = 'cms-captcha-token';

/** Same rules as the SDK's widget schema: short lowercase `data-*` names only. */
const DATA_ATTRIBUTE = /^data-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 80;
/** Twenty declared attributes plus the `data-sitekey` the API adds for auto widgets. */
const MAX_ATTRIBUTES = 21;
const MAX_VALUE_LENGTH = 1024;

/**
 * The widget container's attributes: only bounded `data-*` ones, whatever else arrives, so a
 * provider can describe its container but never add handlers, styles or markup.
 */
export const widgetAttributes = (
  attributes: Record<string, unknown>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].length <= MAX_NAME_LENGTH &&
          DATA_ATTRIBUTE.test(entry[0]) &&
          typeof entry[1] === 'string' &&
          entry[1].length <= MAX_VALUE_LENGTH,
      )
      .slice(0, MAX_ATTRIBUTES),
  );

/**
 * The size attribute Turnstile, hCaptcha and reCAPTCHA all read, with `compact` among its
 * values; widgets that know no such attribute or option ignore it.
 */
const SIZE_ATTRIBUTE = 'data-size';
/** The widest normal-size fixed iframe: reCAPTCHA's 304px (Turnstile 300, hCaptcha 303). */
const NORMAL_WIDGET_WIDTH = 304;

/**
 * The size to render with. A declared `data-size` always wins and is returned as is, so
 * explicit renderers (reCAPTCHA does not read DOM attributes) get it too. Otherwise `compact`
 * when the container, measured at mount, is narrower than a normal-size widget: providers
 * render fixed-width iframes that no container styling can shrink. An unrendered container
 * (no width to measure) keeps the provider's default (null).
 */
export const fittedSize = (container: HTMLElement): string | null => {
  const declared = container.getAttribute(SIZE_ATTRIBUTE);
  if (declared) return declared;
  const { width } = container.getBoundingClientRect();
  return width > 0 && width < NORMAL_WIDGET_WIDTH ? 'compact' : null;
};

const loading = new Map<string, Promise<boolean>>();
const loaded = new Set<string>();

/**
 * Adds the widget script once per page however many widgets use it: an external, async
 * script element (never inline code), with the page's nonce when it has one. Resolves `true`
 * when the script had already loaded before this call (a later mount), `false` when this
 * call's container existed while it loaded.
 */
export const loadWidgetScript = (src: string): Promise<boolean> => {
  if (loaded.has(src)) return Promise.resolve(true);
  let pending = loading.get(src);
  if (!pending) {
    pending = new Promise<boolean>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      const nonce = document.querySelector<HTMLScriptElement>('script[nonce]');
      if (nonce?.nonce) script.nonce = nonce.nonce;
      script.onload = () => {
        loaded.add(src);
        loading.delete(src);
        resolve(false);
      };
      script.onerror = () => {
        loading.delete(src);
        script.remove();
        reject();
      };
      document.head.append(script);
    });
    loading.set(src, pending);
  }
  return pending;
};

type RenderFunction = (
  container: HTMLElement,
  options: {
    sitekey: string;
    callback: (token: unknown) => void;
    /** Accepted by Turnstile, hCaptcha and reCAPTCHA; other widgets may ignore them. */
    'expired-callback': () => void;
    'error-callback': () => void;
    /** The declared `data-size`, or `compact` for a container too narrow (`fittedSize`). */
    size?: string;
  },
) => unknown;
/** The object `render` belongs to; it may offer `reset(id)` and `remove(id)` beside it. */
type WidgetOwner = Partial<Record<'reset' | 'remove', (id: unknown) => void>>;

/** Segments that would walk out of plain globals into prototypes and constructors. */
const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * The function a widget's dotted `render` path names under `root`, bound to the object holding
 * it (`turnstile.render` needs `this === turnstile`). Null until the script has defined it.
 */
export const resolveRender = (
  path: string,
  root: object = globalThis,
): { render: RenderFunction; owner: WidgetOwner } | null => {
  const names = path.split('.');
  if (names.some((name) => UNSAFE_SEGMENTS.has(name))) return null;
  let owner: unknown = root;
  let value: unknown = root;
  for (const name of names) {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    )
      return null;
    owner = value;
    value = (value as Record<string, unknown>)[name];
  }
  return typeof value === 'function'
    ? {
        render: value.bind(owner) as RenderFunction,
        owner: owner as WidgetOwner,
      }
    : null;
};

/** How long a loaded script may take to define its `render` function. */
const RENDER_POLL_MS = 100;
const RENDER_POLL_LIMIT = 100;
/** How often the provider's response field is read, besides on submit. */
const FOLLOW_MS = 250;

export interface MountedWidget {
  /** Clears the solved token; the provider's `reset(id)` when it has one. */
  reset(): void;
  destroy(): void;
}

/**
 * Mounts one widget into `container`, the way its descriptor says, never by provider id.
 * The script loads once per page (`loadWidgetScript`); initialisation runs on every mount:
 * - `render` set: the named global function is called for this container with the site key and
 *   a token callback, on every mount, so a widget comes back after client-side navigation.
 *   Expiry and error callbacks clear the token and report the failure (`onError`).
 * - `render` null: the script renders from the container's `data-*` attributes (the API adds
 *   `data-sitekey`). It scans for containers when it loads; a container mounted after that is
 *   removed and inserted again in place, so a script that watches the document for new
 *   containers renders it. A script that only scans once on load renders the first mount only.
 * Either way the provider's `responseField` in the form is followed (read again on submit), so
 * a token the provider replaces or clears there is the one submitted, and a container too
 * narrow for the normal size gets `data-size="compact"` before the script sees it (also passed
 * to `render` as `size`) unless the declaration sets `data-size` itself, which is then passed
 * to `render` instead (`fittedSize`).
 */
export const mountWidget = (
  container: HTMLElement,
  widget: { script: string; render: string | null; responseField: string },
  siteKey: string,
  {
    onToken,
    onError,
    root = globalThis,
  }: {
    onToken: (token: string) => void;
    onError: () => void;
    root?: object;
  },
): MountedWidget => {
  let active = true;
  let token = '';
  let id: unknown;
  let owner: WidgetOwner | undefined;
  const timers: ReturnType<typeof setInterval>[] = [];
  const form = container.closest('form');
  const size = fittedSize(container);
  if (size) container.setAttribute(SIZE_ATTRIBUTE, size);
  const set = (value: string) => {
    if (!active || value === token) return;
    token = value;
    onToken(value);
  };
  const field = () => {
    const found = form?.elements.namedItem(widget.responseField) as {
      value?: unknown;
    } | null;
    return typeof found?.value === 'string'
      ? (found as { value: string })
      : null;
  };
  // A widget that fills no field reports through its callback only.
  const follow = () => {
    const input = field();
    if (input) set(input.value);
  };
  const fail = () => {
    if (active) onError();
  };
  /** `onError` clears the token where it is submitted; forget it here too. */
  const lapse = () => {
    token = '';
    fail();
  };

  loadWidgetScript(widget.script).then((cached) => {
    if (!active) return;
    timers.push(setInterval(follow, FOLLOW_MS));
    form?.addEventListener('submit', follow, { capture: true });
    if (widget.render === null) {
      if (cached && !container.hasChildNodes())
        container.parentNode?.insertBefore(container, container.nextSibling);
      return;
    }
    const path = widget.render;
    let tries = 0;
    const poll = setInterval(() => {
      const target = resolveRender(path, root);
      if (!target && ++tries < RENDER_POLL_LIMIT) return;
      clearInterval(poll);
      if (!active) return;
      if (!target) return fail();
      owner = target.owner;
      try {
        id = target.render(container, {
          sitekey: siteKey,
          callback: (value) => {
            if (typeof value === 'string') set(value);
          },
          // An expired or failed challenge leaves no token to submit.
          'expired-callback': lapse,
          'error-callback': lapse,
          ...(size && { size }),
        });
      } catch {
        fail();
      }
    }, RENDER_POLL_MS);
    timers.push(poll);
  }, fail);

  return {
    reset() {
      token = '';
      const input = field();
      if (input) input.value = '';
      if (id === undefined) return;
      try {
        owner?.reset?.(id);
      } catch {
        fail();
      }
    },
    destroy() {
      active = false;
      timers.forEach(clearInterval);
      form?.removeEventListener('submit', follow, { capture: true });
      if (id === undefined) return;
      try {
        if (owner?.remove) owner.remove(id);
        else owner?.reset?.(id);
      } catch {
        /* The provider may already have removed its widget. */
      }
    },
  };
};
