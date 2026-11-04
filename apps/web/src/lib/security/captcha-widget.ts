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
 * The size attribute widgets read, with `compact` among its values; widgets that know no such
 * attribute or option ignore it.
 */
const SIZE_ATTRIBUTE = 'data-size';
/** The widest normal-size widget, in CSS pixels. */
const NORMAL_WIDGET_WIDTH = 304;
/** The smallest scale a normal-size widget is shrunk to; a narrower frame gets `compact`. */
const MIN_NORMAL_SCALE = 0.75;

/**
 * The size to render with, decided before the widget renders. A declared `data-size` always
 * wins and is returned as is, for renderers that take it as an option too. Otherwise
 * `compact` only when the `available` width would shrink a normal-size widget below
 * `MIN_NORMAL_SCALE`; a somewhat narrower space keeps the normal widget, scaled down by
 * `widgetScale`. An unrendered frame (no width to measure) keeps the widget's default (null).
 */
export const fittedSize = (
  declared: string | null,
  available: number,
): string | null => {
  if (declared) return declared;

  return available > 0 && available < NORMAL_WIDGET_WIDTH * MIN_NORMAL_SCALE
    ? 'compact'
    : null;
};

/**
 * The factor that shrinks a rendered widget of `widgetWidth` (its measured box) to fit
 * `available`; 1 when it fits or there is nothing to measure yet.
 */
export const widgetScale = (available: number, widgetWidth: number): number =>
  available > 0 && widgetWidth > available ? available / widgetWidth : 1;

/** How a widget is shown: its scale, and the frame's height (null: the frame's own). */
export interface WidgetFit {
  scale: number;
  height: number | null;
}

/**
 * The fit of a widget whose unscaled box is `width` × `height` in a frame `available` wide:
 * scaled down to the frame's width, with the frame as tall as the scaled widget.
 */
export const widgetFit = (
  available: number,
  width: number,
  height: number,
): WidgetFit => {
  const scale = widgetScale(available, width);

  return { scale, height: scale < 1 ? height * scale : null };
};

/** Whether `next` differs from the `applied` fit; only a change is written. */
export const fitChanged = (applied: WidgetFit, next: WidgetFit): boolean =>
  applied.scale !== next.scale || applied.height !== next.height;

/**
 * Whether a widget rendered at `rendered` size needs another size for a frame `available`
 * wide. Never for a declared size or a frame with no width to measure.
 */
export const sizeOutdated = (
  declared: string | null,
  rendered: string | null,
  available: number,
): boolean =>
  !declared && available > 0 && fittedSize(null, available) !== rendered;

/** What one fit does: the widget's size, whether it renders again, and the fit to write. */
export interface FitStep {
  size: string | null;
  rerender: boolean;
  /** Null: nothing to write. */
  fit: WidgetFit | null;
}

/**
 * One fit of a widget measured `width` × `height` (unscaled) in a frame `available` wide.
 * A `switchable` widget takes the size the frame calls for (`sizeOutdated`) and, once
 * `rendered`, renders again at it. Any other widget keeps `size`. A widget not rendering
 * again is scaled to the frame (`widgetFit`), written only when it differs from `applied`.
 */
export const fitStep = ({
  switchable,
  rendered,
  declared,
  size,
  applied,
  available,
  width,
  height,
}: {
  switchable: boolean;
  rendered: boolean;
  declared: string | null;
  size: string | null;
  applied: WidgetFit;
  available: number;
  width: number;
  height: number;
}): FitStep => {
  if (switchable && sizeOutdated(declared, size, available)) {
    const next = fittedSize(declared, available);

    if (rendered) return { size: next, rerender: true, fit: null };

    size = next;
  }

  const next = widgetFit(available, width, height);

  return {
    size,
    rerender: false,
    fit: fitChanged(applied, next) ? next : null,
  };
};

/** The most widget elements watched for size changes. */
const MAX_OBSERVED_ELEMENTS = 32;

/**
 * Calls `fit` when the frame, the container or one of the widget's elements resizes, when
 * elements are added to or removed from the container, and when an iframe in it loads.
 * Removed elements are no longer watched. Returns the function that stops all of it.
 */
export const observeFit = (
  frame: HTMLElement,
  container: HTMLElement,
  fit: () => void,
): (() => void) => {
  const resizes = new ResizeObserver(() => fit());
  const watched = new Set<Element>();
  const watchElements = () => {
    const live = new Set(
      Array.from(container.querySelectorAll('*')).slice(
        0,
        MAX_OBSERVED_ELEMENTS,
      ),
    );

    watched.forEach((element) => {
      if (live.has(element)) return;

      resizes.unobserve(element);
      watched.delete(element);
    });
    live.forEach((element) => {
      if (watched.has(element)) return;

      resizes.observe(element);
      watched.add(element);
    });
  };
  const mutations = new MutationObserver(() => {
    watchElements();
    fit();
  });

  resizes.observe(frame);
  resizes.observe(container);
  watchElements();
  mutations.observe(container, { childList: true, subtree: true });
  container.addEventListener('load', fit, true);

  return () => {
    resizes.disconnect();
    mutations.disconnect();
    watched.clear();
    container.removeEventListener('load', fit, true);
  };
};

const loading = new Map<string, Promise<void>>();
const loaded = new Set<string>();

/**
 * Adds the widget script once per page however many widgets use it: an external, async
 * script element (never inline code), with the page's nonce when it has one. Resolves once
 * the script has loaded.
 */
export const loadWidgetScript = (src: string): Promise<void> => {
  if (loaded.has(src)) return Promise.resolve();
  let pending = loading.get(src);

  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');

      script.src = src;
      script.async = true;
      script.defer = true;
      const nonce = document.querySelector<HTMLScriptElement>('script[nonce]');

      if (nonce?.nonce) script.nonce = nonce.nonce;

      script.onload = () => {
        loaded.add(src);
        loading.delete(src);
        resolve();
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

/**
 * Tickets for a widget's renders. `issue()` starts a render and returns the wrapper for its
 * callbacks; `revoke()` ends the current render. A wrapped callback runs only while its
 * render is the current one.
 */
export const renderTickets = () => {
  let current = 0;

  return {
    issue() {
      const ticket = ++current;

      return <A extends unknown[]>(callback: (...args: A) => void) =>
        (...args: A) => {
          if (ticket === current) callback(...args);
        };
    },
    revoke() {
      current++;
    },
  };
};

/**
 * The first of `elements` named `name` with a string value inside `scope`. Without a match
 * there, the first such element anywhere in `elements` when `anywhere` is set, else null.
 * Null without a scope.
 */
export const responseField = (
  elements: Iterable<Element>,
  name: string,
  scope: Pick<Node, 'contains'> | null,
  anywhere = false,
): { value: string } | null => {
  if (!scope) return null;

  const matches = Array.from(elements).filter(
    (element) =>
      (element as { name?: unknown }).name === name &&
      typeof (element as { value?: unknown }).value === 'string',
  );
  const found =
    matches.find((element) => scope.contains(element)) ??
    (anywhere ? matches[0] : undefined);

  return (found as { value: string } | undefined) ?? null;
};

type RenderFunction = (
  container: HTMLElement,
  options: {
    sitekey: string;
    callback: (token: unknown) => void;
    /** Widgets may ignore these. */
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
 * it. Null until the script has defined it.
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
 * - `render` null: the script renders from the slot's `data-*` attributes (the API adds
 *   `data-sitekey`); the slot is in the document before the script loads, so a script that
 *   scans on load or watches the document renders it. A script that only scans once on load
 *   renders the first mount only.
 * Either way the widget renders into a slot element in `container` carrying the widget's
 * `data-*` attributes (`widgetAttributes`), and the provider's `responseField` is followed
 * (read again on submit; `responseField`): for a `render` widget the one in the current
 * render's slot, for an auto-rendered widget the one in `container`, else the first in the
 * form, so a token the provider replaces or clears there is the one
 * submitted.
 *
 * A declared `data-size` is kept and passed to `render` as `size`. Otherwise a `frame` too
 * narrow for the normal size gets `data-size="compact"` before the script sees it
 * (`fittedSize`). A `render` widget is removed and rendered again at the size its frame later
 * calls for (`sizeOutdated`), which clears the token (`onToken('')`); an auto-rendered widget
 * keeps the size chosen at mount. Whatever renders is scaled down to the frame's width, the
 * frame as tall as the scaled widget, whenever either resizes or the widget's content changes
 * (`observeFit`, `fitStep`).
 */
export const mountWidget = (
  container: HTMLElement,
  widget: {
    script: string;
    render: string | null;
    responseField: string;
    attributes: Record<string, unknown>;
  },
  siteKey: string,
  {
    frame,
    onToken,
    onError,
    root = globalThis,
  }: {
    /** The container's parent: the width the widget must fit, clipping its unscaled box. */
    frame: HTMLElement;
    onToken: (token: string) => void;
    onError: () => void;
    root?: object;
  },
): MountedWidget => {
  let active = true;
  let token = '';
  let id: unknown;
  let target: { render: RenderFunction; owner: WidgetOwner } | undefined;
  let rendered = false;
  let applied: WidgetFit = { scale: 1, height: null };
  const timers: ReturnType<typeof setInterval>[] = [];
  const form = container.closest('form');
  const attributes = widgetAttributes(widget.attributes);
  const declared = attributes[SIZE_ATTRIBUTE] ?? null;
  let size = fittedSize(declared, frame.getBoundingClientRect().width);

  /** A fresh element with the widget's `data-*` attributes at `slotSize`. */
  const createSlot = (slotSize: string | null): HTMLElement => {
    const element = document.createElement('div');

    Object.entries(attributes).forEach(([name, value]) =>
      element.setAttribute(name, value),
    );

    if (slotSize) element.setAttribute(SIZE_ATTRIBUTE, slotSize);
    else element.removeAttribute(SIZE_ATTRIBUTE);

    return element;
  };

  const tickets = renderTickets();
  /** The slot of the current render; null before the first and after removal. */
  let current: HTMLElement | null = null;

  const set = (value: string) => {
    if (!active || value === token) return;

    token = value;
    onToken(value);
  };
  /**
   * The response field in the current render's slot (`render` set); for an auto-rendered
   * widget the one in the container, else the first in the form.
   */
  const field = () =>
    responseField(
      form?.elements ?? [],
      widget.responseField,
      widget.render === null ? container : current,
      widget.render === null,
    );
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
  /** Forgets the token here and in the response field, and reports it cleared. */
  const clear = () => {
    token = '';

    const input = field();

    if (input) input.value = '';
    if (active) onToken('');
  };

  /**
   * Renders into a fresh slot at the current size. Its callbacks act only while it is the
   * current render (`renderTickets`).
   */
  const render = () => {
    if (!target) return;

    const slot = createSlot(size);
    const scoped = tickets.issue();

    current = slot;
    container.replaceChildren(slot);

    try {
      id = target.render(slot, {
        sitekey: siteKey,
        callback: scoped((value: unknown) => {
          if (typeof value === 'string') set(value);
        }),
        // An expired or failed challenge leaves no token to submit.
        'expired-callback': scoped(lapse),
        'error-callback': scoped(lapse),
        ...(size && { size }),
      });
      rendered = true;
    } catch {
      fail();
    }
  };

  /** Removes the rendered widget: the provider's `remove(id)`, else its `reset(id)`. */
  const unrender = () => {
    rendered = false;
    tickets.revoke();
    current = null;

    if (id === undefined) return;

    try {
      if (target?.owner.remove) target.owner.remove(id);
      else target?.owner.reset?.(id);
    } catch {
      /* The provider may already have removed its widget. */
    }

    id = undefined;
  };

  /**
   * Measures first, then writes only what changed (`fitStep`): renders the widget again at a
   * size the frame now calls for, or scales the container about its top left corner so the
   * widget's unscaled box (overflow included) spans the frame, with the frame at the scaled
   * height.
   */
  const fit = () => {
    if (!active) return;

    const step = fitStep({
      switchable: widget.render !== null,
      rendered,
      declared,
      size,
      applied,
      available: frame.getBoundingClientRect().width,
      width:
        container.scrollWidth > container.clientWidth
          ? container.scrollWidth
          : container.getBoundingClientRect().width / applied.scale,
      height: Math.max(container.offsetHeight, container.scrollHeight),
    });

    size = step.size;

    if (step.rerender) {
      unrender();
      clear();
      render();

      return;
    }

    const next = step.fit;

    if (!next) return;

    applied = next;

    if (next.scale < 1) {
      container.style.transformOrigin = 'top left';
      container.style.transform = `scale(${next.scale})`;
    } else {
      container.style.removeProperty('transform');
    }

    if (next.height === null) frame.style.removeProperty('height');
    else frame.style.height = `${next.height}px`;
  };

  if (widget.render === null) container.replaceChildren(createSlot(size));

  const unobserve = observeFit(frame, container, fit);

  loadWidgetScript(widget.script).then(() => {
    if (!active) return;

    timers.push(setInterval(follow, FOLLOW_MS));
    form?.addEventListener('submit', follow, { capture: true });

    if (widget.render === null) return;

    const path = widget.render;
    let tries = 0;
    const poll = setInterval(() => {
      const resolved = resolveRender(path, root);

      if (!resolved && ++tries < RENDER_POLL_LIMIT) return;

      clearInterval(poll);

      if (!active) return;

      if (!resolved) return fail();

      target = resolved;
      render();
      fit();
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
        target?.owner.reset?.(id);
      } catch {
        fail();
      }
    },
    destroy() {
      active = false;
      unobserve();
      timers.forEach(clearInterval);
      form?.removeEventListener('submit', follow, { capture: true });
      unrender();
    },
  };
};
