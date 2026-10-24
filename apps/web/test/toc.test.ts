import { expect, test } from 'bun:test';
import { enhanceToc } from '#lib/theme/content/toc.js';

/** A narrow DOM fixture: geometry and browser observation are controlled by each test. */
const fixture = () => {
  const links = [
    { id: 'first', nav: 0 },
    { id: '한글', nav: 0 },
    { id: 'first', nav: 1 },
  ].map(({ id, nav }) => ({
    id,
    nav,
    target: '',
    current: '',
    getAttribute: () => `#${id}`,
    hasAttribute: () => false,
    setAttribute(_key: string, value: string) {
      this.current = value;
    },
    removeAttribute() {
      this.current = '';
    },
    closest() {
      return this;
    },
  }));
  const headings = ['first', '한글'].map((id, index) => ({
    id,
    top: index ? 300 : 100,
    focused: false,
    getBoundingClientRect() {
      return { top: this.top };
    },
    hasAttribute: () => false,
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    focus() {
      this.focused = true;
    },
  }));
  const navs = [0, 1].map((nav) => ({
    contains: (link: (typeof links)[number]) => link.nav === nav,
  }));
  let clicked: (event: MouseEvent) => void;
  let intersected: () => void;
  let mutated: () => void;
  let resized: () => void;
  let disconnected = 0;
  let reduced = false;
  let scroll: ScrollToOptions | undefined;
  let fragment = '';
  let margin = '';
  let cssOffset = '';
  const header = {
    getBoundingClientRect: () => ({ height: 50 }),
  };
  const view = {
    scrollY: 200,
    history: {
      state: { kept: true },
      pushState(_state: unknown, _unused: string, url: string) {
        fragment = url;
      },
    },
    getComputedStyle: (node: unknown) =>
      node === header
        ? { position: 'sticky', top: '32px' }
        : { scrollMarginTop: '42px' },
    matchMedia: () => ({ matches: reduced }),
    scrollTo(options: ScrollToOptions) {
      scroll = options;
    },
    addEventListener(_name: string, callback: () => void) {
      resized = callback;
    },
    removeEventListener() {},
    IntersectionObserver: class {
      constructor(callback: () => void, options: IntersectionObserverInit) {
        intersected = callback;
        margin = options.rootMargin!;
      }
      observe() {}
      disconnect() {
        disconnected++;
      }
    },
    MutationObserver: class {
      constructor(callback: () => void) {
        mutated = callback;
      }
      observe() {}
      disconnect() {
        disconnected++;
      }
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {
        disconnected++;
      }
    },
  };
  const element = {
    ownerDocument: { defaultView: view },
    closest: () => ({ querySelectorAll: () => [header] }),
    querySelectorAll: (selector: string) =>
      selector === '.cms-toc'
        ? navs
        : selector.includes('a[')
          ? links
          : headings,
    contains: (link: (typeof links)[number]) => links.includes(link),
    style: {
      setProperty(_key: string, value: string) {
        cssOffset = value;
      },
      removeProperty() {
        cssOffset = '';
      },
    },
    addEventListener(_name: string, callback: (event: MouseEvent) => void) {
      clicked = callback;
    },
    removeEventListener() {},
  };
  const action = enhanceToc(element as unknown as HTMLElement);
  return {
    links,
    headings,
    action,
    get scroll() {
      return scroll;
    },
    get fragment() {
      return fragment;
    },
    get margin() {
      return margin;
    },
    get cssOffset() {
      return cssOffset;
    },
    get disconnected() {
      return disconnected;
    },
    reduce() {
      reduced = true;
    },
    intersect() {
      intersected();
    },
    replace() {
      mutated();
    },
    resize() {
      resized();
    },
    click(index: number, ctrlKey = false) {
      let prevented = false;
      clicked({
        button: 0,
        ctrlKey,
        target: links[index],
        preventDefault() {
          prevented = true;
        },
      } as unknown as MouseEvent);
      return prevented;
    },
  };
};

test('active links follow intersections independently in filtered, multiple TOCs', () => {
  const dom = fixture();
  expect(dom.links.map((link) => link.current)).toEqual([
    'location',
    '',
    'location',
  ]);
  dom.headings[1]!.top = 80;
  dom.intersect();
  expect(dom.links.map((link) => link.current)).toEqual([
    '',
    'location',
    'location',
  ]);
  dom.action.destroy();
  expect(dom.links.every((link) => !link.current)).toBe(true);
  expect(dom.disconnected).toBeGreaterThanOrEqual(3);
  expect(dom.cssOffset).toBe('');
});

test('scrolling includes admin bar and sticky header, preserves fragments and honors reduced motion', () => {
  const dom = fixture();
  expect(dom.margin).toBe('-92px 0px -60% 0px');
  expect(dom.click(1)).toBe(false);
  expect(dom.scroll).toBeUndefined();
  expect(dom.fragment).toBe('');
  expect(dom.headings[1]!.focused).toBe(true);
  dom.reduce();
  dom.click(1);
  expect(dom.scroll).toBeUndefined();
  expect(dom.click(0, true)).toBe(false);
  dom.action.destroy();
});

test('replacement content and resize rebuild observation rather than retaining stale links', () => {
  const dom = fixture();
  dom.headings.shift();
  dom.links.splice(0, 1);
  dom.replace();
  expect(dom.links[0]?.current).toBe('location');
  dom.resize();
  expect(dom.cssOffset).toBe('92px');
  dom.action.destroy();
});
