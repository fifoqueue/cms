import { afterEach, beforeEach, expect, test } from 'bun:test';
import { allowCaptcha, withWidgetOrigins } from '#lib/server/captcha.js';
import {
  CAPTCHA_TOKEN_FIELD,
  mountWidget,
  resolveRender,
  widgetAttributes,
} from '#lib/security/captcha-widget.js';

const origin = 'https://captcha.example';
const widget = {
  script: `${origin}/api.js`,
  scriptOrigin: origin,
  render: null,
  origins: [],
  attributes: {},
  responseField: 'plugin-captcha-response',
};

/** The script elements the loader adds, against a minimal document. */
let scripts: Array<{ src?: string; onload?: () => void; onerror?: () => void }>;
beforeEach(() => {
  scripts = [];
  Object.assign(globalThis, {
    document: {
      createElement: () => {
        const script = { remove: () => undefined };
        scripts.push(script);
        return script;
      },
      querySelector: () => null,
      head: { append: () => undefined },
    },
  });
});
afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

/** A widget container inside a form whose provider response field is `field`. */
const fakeContainer = (field: { value: string } | null = null) => {
  const submits: Array<() => void> = [];
  const inserted: unknown[] = [];
  const form = {
    elements: { namedItem: () => field },
    addEventListener: (_: string, listener: () => void) =>
      submits.push(listener),
    removeEventListener: () => undefined,
  };
  const container = {
    closest: () => form,
    hasChildNodes: () => false,
    nextSibling: null,
    parentNode: { insertBefore: (node: unknown) => inserted.push(node) },
  } as unknown as HTMLElement;
  return { container, inserted, submit: () => submits.forEach((run) => run()) };
};

const noop = () => undefined;

test('a render widget is rendered on every mount from one script load', async () => {
  const script = `${origin}/render.js`;
  const calls: Array<{ self: unknown; container: unknown; options: unknown }> =
    [];
  const removed: unknown[] = [];
  const api = {
    widgets: {
      render(this: unknown, container: unknown, options: unknown) {
        calls.push({ self: this, container, options });
        return calls.length;
      },
      remove: (id: unknown) => removed.push(id),
    },
  };
  const tokens: string[] = [];
  const descriptor = { ...widget, script, render: 'widgets.render' };
  const first = fakeContainer();
  let errors = 0;
  const one = mountWidget(first.container, descriptor, 'site-key', {
    onToken: (value) => tokens.push(value),
    onError: () => errors++,
    root: api,
  });
  scripts[0]!.onload!();
  await Bun.sleep(150);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.self).toBe(api.widgets);
  expect(calls[0]!.container).toBe(first.container);
  const options = calls[0]!.options as {
    sitekey: string;
    callback: (token: unknown) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  };
  expect(options.sitekey).toBe('site-key');
  options.callback('solved');
  options.callback(42);
  expect(tokens).toEqual(['solved']);
  // Expiry and errors drop the token and show the failed state; solving again restores it.
  options['expired-callback']();
  expect(errors).toBe(1);
  options.callback('solved');
  expect(tokens).toEqual(['solved', 'solved']);
  options['error-callback']();
  expect(errors).toBe(2);
  one.destroy();
  expect(removed).toEqual([1]);
  // Remounting (client-side navigation) renders again without loading again.
  const second = fakeContainer();
  mountWidget(second.container, descriptor, 'site-key', {
    onToken: noop,
    onError: noop,
    root: api,
  });
  await Bun.sleep(150);
  expect(scripts).toHaveLength(1);
  expect(calls).toHaveLength(2);
  expect(calls[1]!.container).toBe(second.container);
  expect(first.inserted).toEqual([]);
});

test('an auto widget is reinserted only when mounted after its script loaded', async () => {
  const script = `${origin}/auto.js`;
  const field = { value: '' };
  const tokens: string[] = [];
  const first = fakeContainer(field);
  const mounted = mountWidget(first.container, { ...widget, script }, 'k', {
    onToken: (value) => tokens.push(value),
    onError: noop,
  });
  scripts[0]!.onload!();
  await Bun.sleep(0);
  // Its container existed while the script loaded and scanned the page.
  expect(first.inserted).toEqual([]);
  // The provider's response field is what gets submitted.
  field.value = 'auto-token';
  first.submit();
  expect(tokens).toEqual(['auto-token']);
  mounted.reset();
  expect(field.value).toBe('');
  const second = fakeContainer();
  mountWidget(second.container, { ...widget, script }, 'k', {
    onToken: noop,
    onError: noop,
  });
  await Bun.sleep(0);
  expect(scripts).toHaveLength(1);
  expect(second.inserted).toEqual([second.container]);
});

test('a script that fails to load reports it and loads again next time', async () => {
  const script = `${origin}/broken.js`;
  let errors = 0;
  mountWidget(fakeContainer().container, { ...widget, script }, 'k', {
    onToken: noop,
    onError: () => errors++,
  });
  scripts[0]!.onerror!();
  await Bun.sleep(0);
  expect(errors).toBe(1);
  mountWidget(fakeContainer().container, { ...widget, script }, 'k', {
    onToken: noop,
    onError: noop,
  });
  expect(scripts).toHaveLength(2);
});

test('render paths resolve to bound globals only', () => {
  const root = { a: { b: { render() {} } }, value: 1 };
  expect(resolveRender('a.b.render', root)?.owner).toBe(root.a.b);
  expect(resolveRender('a.missing.render', root)).toBeNull();
  expect(resolveRender('value', root)).toBeNull();
  expect(resolveRender('a.constructor', root)).toBeNull();
  expect(resolveRender('a.__proto__.toString', root)).toBeNull();
});

test('only bounded data-* attributes reach the widget container', () => {
  expect(
    widgetAttributes({
      'data-sitekey': 'abc',
      'data-theme-mode': 'dark',
      onclick: 'alert(1)',
      class: 'x',
      style: 'display:none',
      'DATA-UPPER': 'no',
      'data-': 'no',
      'data-number': 1,
      'data-long': 'x'.repeat(1025),
      // Names are at most 80 characters.
      [`data-${'a'.repeat(75)}`]: 'kept',
      [`data-${'b'.repeat(76)}`]: 'dropped',
    }),
  ).toEqual({
    'data-sitekey': 'abc',
    'data-theme-mode': 'dark',
    [`data-${'a'.repeat(75)}`]: 'kept',
  });
  const many = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`data-a${index}`, 'v']),
  );
  // Twenty declared plus the API's `data-sitekey`.
  expect(Object.keys(widgetAttributes(many))).toHaveLength(21);
});

test('a page admits the widget origin only when it renders a widget', () => {
  const event = () => ({
    locals: { token: null, user: null } as App.Locals,
  });
  const none = event();
  expect(allowCaptcha(none, { provider: 'none', widget })).toEqual({
    provider: 'none',
    widget,
  });
  expect(none.locals.captchaOrigins).toBeUndefined();
  const without = event();
  allowCaptcha(without, { provider: 'plugin:acme:check', widget: null });
  allowCaptcha(without, null);
  expect(without.locals.captchaOrigins).toBeUndefined();
  const shown = event();
  allowCaptcha(shown, { provider: 'plugin:acme:check', widget });
  expect(shown.locals.captchaOrigins).toEqual([origin]);
  // The widget's other origins join its script origin, once each.
  const extended = event();
  allowCaptcha(extended, {
    provider: 'turnstile',
    widget: {
      ...widget,
      origins: ['https://*.assets.example', origin, 'https://*.assets.example'],
    },
  });
  expect(extended.locals.captchaOrigins).toEqual([
    origin,
    'https://*.assets.example',
  ]);
});

test('the policy gains the origins only in directives it restricts', () => {
  const extra = 'https://assets.example';
  const origins = [origin, extra];
  const both = `${origin} ${extra}`;
  // Nothing the widget loads is restricted: adding a directive would only forbid more.
  expect(withWidgetOrigins("frame-ancestors 'none'", origins)).toBe(
    "frame-ancestors 'none'",
  );
  expect(withWidgetOrigins("default-src 'self'", [])).toBe(
    "default-src 'self'",
  );
  // `default-src` is spelled out per kind, never widened itself.
  expect(withWidgetOrigins("default-src 'self'", origins)).toBe(
    `default-src 'self'; script-src 'self' ${both}; frame-src 'self' ${both}; connect-src 'self' ${both}; img-src 'self' ${both}; style-src 'self' ${both}`,
  );
  expect(withWidgetOrigins("default-src 'none'", origins)).toBe(
    `default-src 'none'; script-src ${both}; frame-src ${both}; connect-src ${both}; img-src ${both}; style-src ${both}`,
  );
  // Script and style elements follow their `-elem` directive when the policy sets one.
  expect(
    withWidgetOrigins(
      "script-src 'self'; script-src-elem 'self'; style-src 'self'; style-src-elem 'self'",
      origins,
    ),
  ).toBe(
    `script-src 'self'; script-src-elem 'self' ${both}; style-src 'self'; style-src-elem 'self' ${both}`,
  );
  // Frames fall back to `child-src`, which keeps its own sources.
  expect(withWidgetOrigins("child-src 'self'", origins)).toBe(
    `child-src 'self'; frame-src 'self' ${both}`,
  );
  expect(withWidgetOrigins("script-src 'none'; img-src 'none'", origins)).toBe(
    `script-src ${both}; img-src ${both}`,
  );
  // Origins already admitted are not repeated.
  expect(withWidgetOrigins(`script-src ${origin}`, origins)).toBe(
    `script-src ${both}`,
  );
});

test('every provider submits its token in one field', () => {
  expect(CAPTCHA_TOKEN_FIELD).toBe('cms-captcha-token');
});
