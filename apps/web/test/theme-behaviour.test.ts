import { describe, expect, test } from 'bun:test';
import type { ContentClient } from '@cms/sdk/client';
import { homePosts } from '#lib/server/archive.js';
import { inertOutside } from '#lib/theme/modal.js';
import { rememberedScheme } from '#lib/theme/style.js';

/** A content client whose lists hold `totals[type]` published entries. */
const client = (totals: Record<string, number>) => {
  const asked: string[] = [];
  const api = {
    list: async ({ type, sticky }: { type: string; sticky?: string }) => {
      asked.push(`${type}:${sticky}`);
      const total = sticky === 'only' ? 0 : (totals[type] ?? 0);
      return {
        items: Array.from({ length: Math.min(total, 10) }, (_, index) => ({
          id: `${type}-${index}`,
          type,
          slug: `${type}-${index}`,
          path: `/${type}-${index}`,
          title: type,
          excerpt: '',
          publishedAt: '2026-01-01T00:00:00.000Z',
          extraTerms: [],
          categories: [],
          tags: [],
          author: null,
          sticky: false,
          commentCount: 0,
          protected: false,
          featuredImage: null,
        })),
        total,
        page: 1,
        pageSize: 10,
      };
    },
  };
  return { api: api as unknown as ContentClient, asked };
};

describe('home list type', () => {
  test('without ?type= the home page lists the first type that has published entries', async () => {
    const { api } = client({ post: 0, article: 3 });
    const home = await homePosts(api, 'post', false, 1, 10);
    expect(home.type).toBe('article');
    expect(home.posts.total).toBe(3);
  });

  test('posts stay the default while they exist, and an explicit choice is kept even when empty', async () => {
    const both = client({ post: 2, article: 3 });
    expect((await homePosts(both.api, 'post', false, 1, 10)).type).toBe('post');
    expect(both.asked.some((entry) => entry.startsWith('article'))).toBe(false);

    const explicit = client({ post: 0, article: 3 });
    const home = await homePosts(explicit.api, 'post', true, 1, 10);
    expect(home).toMatchObject({ type: 'post', posts: { total: 0 } });

    const none = client({});
    expect((await homePosts(none.api, 'post', false, 1, 10)).type).toBe('post');
  });
});

/** A minimal element tree: enough DOM for `inertOutside`. */
class FakeElement {
  children: FakeElement[] = [];
  attributes = new Set<string>();
  constructor(
    public name: string,
    children: FakeElement[] = [],
  ) {
    this.children = children;
  }
  contains(other: FakeElement): boolean {
    return (
      other === this || this.children.some((child) => child.contains(other))
    );
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  setAttribute(name: string) {
    this.attributes.add(name);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

describe('theme modal panels', () => {
  test('everything but the panel, its ancestors and kept elements becomes inert, and is restored', () => {
    const toggle = new FakeElement('toggle');
    const panel = new FakeElement('panel');
    const brand = new FakeElement('brand');
    const tools = new FakeElement('tools', [toggle, panel]);
    const header = new FakeElement('header', [brand, tools]);
    const main = new FakeElement('main');
    const footer = new FakeElement('footer');
    footer.setAttribute('inert');
    const site = new FakeElement('site', [header, main, footer]);
    const skip = new FakeElement('skip');
    const body = new FakeElement('body', [skip, site]);

    const restore = inertOutside(
      body as unknown as Element,
      [panel, toggle] as unknown as Element[],
    );
    const inert = (FakeElement: FakeElement) =>
      FakeElement.hasAttribute('inert');
    expect([skip, brand, main, footer].every(inert)).toBe(true);
    expect([site, header, tools, panel, toggle].some(inert)).toBe(false);

    restore();
    expect([skip, brand, main].some(inert)).toBe(false);
    // What was inert before the panel opened stays inert.
    expect(inert(footer)).toBe(true);
  });
});

describe('remembered color scheme', () => {
  const theme = (base: string, toggle: boolean) => ({
    settings: {
      alternatePalette: [{ slug: 'base', name: 'Base', color: base }],
      colorScheme: { auto: false, toggle },
    },
  });

  test('a stored choice selects the alternate or the default palette, only when the theme offers the toggle', () => {
    // A dark theme whose alternate palette is light.
    const dark = theme('#ffffff', true) as never;
    expect(rememberedScheme(dark, 'light')).toBe('alternate');
    expect(rememberedScheme(dark, 'dark')).toBe('default');
    for (const stored of [null, '', 'blue', 'alternate'])
      expect(rememberedScheme(dark, stored)).toBeNull();
    expect(
      rememberedScheme(theme('#ffffff', false) as never, 'light'),
    ).toBeNull();
    expect(
      rememberedScheme(
        {
          settings: {
            alternatePalette: [],
            colorScheme: { auto: false, toggle: true },
          },
        } as never,
        'light',
      ),
    ).toBeNull();
  });
});
