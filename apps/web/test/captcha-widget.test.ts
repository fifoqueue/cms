import { expect, test } from 'bun:test';
import {
  fitChanged,
  fitStep,
  fittedSize,
  observeFit,
  renderTickets,
  responseField,
  sizeOutdated,
  widgetFit,
  widgetScale,
  type WidgetFit,
} from '#lib/security/captcha-widget.js';

test('fittedSize keeps the normal widget for a somewhat narrow frame and goes compact only when tiny', () => {
  expect(fittedSize(null, 640)).toBeNull();
  expect(fittedSize(null, 290)).toBeNull();
  expect(fittedSize(null, 228)).toBeNull();
  expect(fittedSize(null, 227)).toBe('compact');
  expect(fittedSize(null, 150)).toBe('compact');

  // An unrendered frame has nothing to measure.
  expect(fittedSize(null, 0)).toBeNull();
});

test('fittedSize returns a declared size exactly, whatever the width', () => {
  expect(fittedSize('normal', 150)).toBe('normal');
  expect(fittedSize('compact', 640)).toBe('compact');
  expect(fittedSize('flexible', 290)).toBe('flexible');
});

test('widgetScale shrinks a measured widget to the frame and never enlarges it', () => {
  expect(widgetScale(290, 300)).toBeCloseTo(290 / 300);
  expect(widgetScale(150, 304)).toBeCloseTo(150 / 304);
  expect(widgetScale(640, 300)).toBe(1);
  expect(widgetScale(300, 300)).toBe(1);

  // Nothing rendered or measured yet.
  expect(widgetScale(290, 0)).toBe(1);
  expect(widgetScale(0, 300)).toBe(1);
});

test('widgetFit scales a fixed-width widget wider than its frame to the frame width', () => {
  // A 304px widget in a 250px frame, whatever the container's own width.
  expect(widgetFit(250, 304, 78)).toEqual({
    scale: 250 / 304,
    height: (78 * 250) / 304,
  });
  expect(widgetFit(400, 304, 78)).toEqual({ scale: 1, height: null });
});

test('fitChanged reports no change for a repeated measurement, so a fit never retriggers itself', () => {
  const fit = widgetFit(250, 304, 78);

  expect(fitChanged(fit, widgetFit(250, 304, 78))).toBe(false);
  expect(fitChanged(fit, widgetFit(300, 304, 78))).toBe(true);
  expect(fitChanged({ scale: 1, height: null }, widgetFit(400, 304, 78))).toBe(
    false,
  );
});

test('sizeOutdated renders again when the frame crosses the compact width, never for a declared size', () => {
  expect(sizeOutdated(null, 'compact', 400)).toBe(true);
  expect(sizeOutdated(null, null, 200)).toBe(true);
  expect(sizeOutdated(null, 'compact', 200)).toBe(false);
  expect(sizeOutdated(null, null, 300)).toBe(false);
  expect(sizeOutdated('compact', 'compact', 400)).toBe(false);

  // A hidden frame has no width to decide by.
  expect(sizeOutdated(null, 'compact', 0)).toBe(false);
});

test('a superseded render’s callbacks after a size switch neither set nor clear the token', () => {
  const tickets = renderTickets();
  const events: string[] = [];
  let token = '';
  const set = (value: unknown) => {
    token = String(value);
    events.push(`set:${token}`);
  };
  const lapse = () => {
    token = '';
    events.push('lapse');
  };
  const first = tickets.issue();
  const old = { callback: first(set), expired: first(lapse) };

  old.callback('solved');

  // The switch: the first render is removed and the token cleared, then it renders again.
  tickets.revoke();
  token = '';
  events.push('cleared');

  const second = tickets.issue();
  const fresh = { callback: second(set) };

  old.callback('late-old');
  old.expired();

  expect(token).toBe('');

  fresh.callback('new');
  old.expired();

  expect(token).toBe('new');
  expect(events).toEqual(['set:solved', 'cleared', 'set:new']);
});

test('responseField picks the same-name control in the current slot, never a superseded or outside one', () => {
  const control = (value: string) =>
    ({ name: 'cf-turnstile-response', value }) as unknown as Element;
  const outside = control('outside');
  const superseded = control('superseded');
  const fresh = control('current');
  const elements = [outside, superseded, fresh];
  const slot = (inside: Element[]) => ({
    contains: (node: Node | null) => inside.includes(node as Element),
  });

  expect(responseField(elements, 'cf-turnstile-response', slot([fresh]))).toBe(
    fresh as never,
  );

  // A scope holding two same-name controls yields the first.
  expect(
    responseField(elements, 'cf-turnstile-response', slot([superseded, fresh])),
  ).toBe(superseded as never);

  expect(responseField(elements, 'cf-turnstile-response', slot([]))).toBeNull();
  expect(responseField(elements, 'cf-turnstile-response', null)).toBeNull();
  expect(responseField(elements, 'other', slot([fresh]))).toBeNull();
});

test('responseField falls back to a same-form control outside the container for an auto-rendered widget only', () => {
  const outside = {
    name: 'plugin-response',
    value: 'solved',
  } as unknown as Element;
  const inside = {
    name: 'plugin-response',
    value: '',
  } as unknown as Element;
  const empty = { contains: () => false };
  const holding = (element: Element) => ({
    contains: (node: Node | null) => node === element,
  });

  // Auto-rendered: the control outside the container is followed when none is inside it.
  expect(responseField([outside], 'plugin-response', empty, true)).toBe(
    outside as never,
  );

  // A control inside the container still comes first.
  expect(
    responseField([outside, inside], 'plugin-response', holding(inside), true),
  ).toBe(inside as never);

  // Render mode: only the current slot counts.
  expect(responseField([outside], 'plugin-response', empty)).toBeNull();
});

const unscaled: WidgetFit = { scale: 1, height: null };

test('fitStep renders a rendered render-mode widget again when its frame grows past the compact width', () => {
  expect(
    fitStep({
      switchable: true,
      rendered: true,
      declared: null,
      size: 'compact',
      applied: unscaled,
      available: 400,
      width: 164,
      height: 144,
    }),
  ).toEqual({ size: null, rerender: true, fit: null });

  // Not rendered yet: the size changes, and the widget renders at it once.
  expect(
    fitStep({
      switchable: true,
      rendered: false,
      declared: null,
      size: 'compact',
      applied: unscaled,
      available: 400,
      width: 0,
      height: 0,
    }),
  ).toEqual({ size: null, rerender: false, fit: null });
});

test('fitStep keeps an auto-rendered widget compact in a grown frame and rescales it without overflow', () => {
  // Compact at mount in a 200px frame: 164px wide, scaled down to the frame.
  const narrow = fitStep({
    switchable: false,
    rendered: true,
    declared: null,
    size: 'compact',
    applied: unscaled,
    available: 150,
    width: 164,
    height: 144,
  });

  expect(narrow).toEqual({
    size: 'compact',
    rerender: false,
    fit: { scale: 150 / 164, height: (144 * 150) / 164 },
  });

  // Grown to 400px: still compact, the scale removed.
  expect(
    fitStep({
      switchable: false,
      rendered: true,
      declared: null,
      size: 'compact',
      applied: narrow.fit!,
      available: 400,
      width: 164,
      height: 144,
    }),
  ).toEqual({ size: 'compact', rerender: false, fit: unscaled });
});

test('fitStep never changes a declared size and writes nothing for an unchanged fit', () => {
  const fit = widgetFit(200, 304, 78);

  expect(
    fitStep({
      switchable: true,
      rendered: true,
      declared: 'normal',
      size: 'normal',
      applied: fit,
      available: 200,
      width: 304,
      height: 78,
    }),
  ).toEqual({ size: 'normal', rerender: false, fit: null });
});

test('observeFit refits when the widget adds content or an iframe loads, unwatches removed elements, and stops on disconnect', () => {
  const observers: {
    kind: string;
    callback: () => void;
    observed: unknown[];
    options: unknown[];
    disconnected: boolean;
  }[] = [];
  const fake = (kind: string) =>
    class {
      record;

      constructor(callback: () => void) {
        this.record = {
          kind,
          callback,
          observed: [] as unknown[],
          options: [] as unknown[],
          disconnected: false,
        };
        observers.push(this.record);
      }

      observe(target: unknown, options?: unknown) {
        this.record.observed.push(target);
        this.record.options.push(options);
      }

      unobserve(target: unknown) {
        this.record.observed = this.record.observed.filter(
          (observed) => observed !== target,
        );
      }

      disconnect() {
        this.record.disconnected = true;
      }
    };
  const saved = {
    ResizeObserver: globalThis.ResizeObserver,
    MutationObserver: globalThis.MutationObserver,
  };
  const listeners = new Map<string, () => void>();
  const iframe = { tagName: 'IFRAME' };
  let children: unknown[] = [];
  const frame = {};
  const container = {
    querySelectorAll: () => children,
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  let fits = 0;

  Object.assign(globalThis, {
    ResizeObserver: fake('resize'),
    MutationObserver: fake('mutation'),
  });

  try {
    const stop = observeFit(
      frame as HTMLElement,
      container as unknown as HTMLElement,
      () => fits++,
    );
    const resize = observers.find((o) => o.kind === 'resize')!;
    const mutation = observers.find((o) => o.kind === 'mutation')!;

    expect(resize.observed).toEqual([frame, container]);
    expect(mutation.observed).toEqual([container]);
    expect(mutation.options).toEqual([{ childList: true, subtree: true }]);

    // The provider inserts its iframe after the container was sized.
    children = [iframe];
    mutation.callback();

    expect(fits).toBe(1);
    expect(resize.observed).toContain(iframe);

    listeners.get('load')!();

    expect(fits).toBe(2);

    // A re-render replaces the widget: the removed iframe is no longer watched.
    const replacement = { tagName: 'IFRAME' };

    children = [replacement];
    mutation.callback();

    expect(resize.observed).toEqual([frame, container, replacement]);

    // At most 32 live widget elements are watched.
    children = Array.from({ length: 40 }, () => ({}));
    mutation.callback();

    expect(resize.observed).toEqual([
      frame,
      container,
      ...children.slice(0, 32),
    ]);

    stop();

    expect(resize.disconnected && mutation.disconnected).toBe(true);
    expect(listeners.has('load')).toBe(false);
  } finally {
    Object.assign(globalThis, saved);
  }
});
