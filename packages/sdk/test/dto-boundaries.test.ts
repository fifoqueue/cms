import { describe, expect, test } from 'bun:test';
import {
  CmsApiError,
  createAuthClient,
  createContentClient,
} from '#sdk/client';
import type { PublicContent } from '#sdk/content';
import { toPublicEntrySeo } from '#sdk/seo';

const published: PublicContent = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'post',
  title: 'Published',
  slug: 'published',
  path: '/published',
  seo: toPublicEntrySeo({}),
  excerpt: '',
  html: '<p>Public text</p>',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  extraTerms: [],
  categories: [],
  tags: [],
  author: { name: 'Ann', slug: 'ann' },
  sticky: false,
  commentCount: 0,
  protected: false,
  featuredImage: null,
  meta: {},
};

const options = (payload: unknown) => ({
  baseUrl: 'http://localhost:4000',
  fetch: (async () => Response.json(payload)) as typeof fetch,
});

describe('DTO trust boundaries', () => {
  test('probe error locations retain only the documented non-secret params', async () => {
    const client = createAuthClient({
      baseUrl: 'http://localhost:4000',
      fetch: (async () =>
        Response.json(
          {
            error: {
              code: 'invalid_input',
              message: 'The connection test file could not be removed.',
              issues: [
                {
                  path: 'probe',
                  message: 'The connection test file could not be removed.',
                  params: {
                    bucket: 'media',
                    key: 'uploads/.cms-probe',
                    secret: 'secret-token',
                  },
                  rawBody: 'secret-body',
                },
              ],
            },
          },
          { status: 400 },
        )) as typeof fetch,
    });
    try {
      await client.login({ email: 'wrong', password: 'password' });
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(CmsApiError);
      expect(error).toMatchObject({
        issues: [
          {
            path: 'probe',
            message: 'The connection test file could not be removed.',
            params: { bucket: 'media', key: 'uploads/.cms-probe' },
          },
        ],
      });
      expect(JSON.stringify(error)).not.toContain('secret-');
    }
  });
  test('API errors project field issues instead of forwarding arbitrary data', async () => {
    const client = createAuthClient({
      baseUrl: 'http://localhost:4000',
      fetch: (async () =>
        Response.json(
          {
            error: {
              code: 'invalid_input',
              message: 'Invalid input',
              password: 'secret-envelope',
              issues: [
                {
                  path: 'email',
                  message: 'Enter an email address',
                  received: 'secret-input',
                  details: { token: 'secret-token' },
                },
              ],
            },
          },
          { status: 400 },
        )) as typeof fetch,
    });
    try {
      await client.login({ email: 'wrong', password: 'password' });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(CmsApiError);
      expect(error).toMatchObject({
        status: 400,
        code: 'invalid_input',
        issues: [{ path: 'email', message: 'Enter an email address' }],
      });
      expect(JSON.stringify(error)).not.toContain('secret-');
    }
  });

  test('public content rejects admin fields before they can become page data', async () => {
    const stored = { title: ' Public title ', focusKeyword: 'private' };
    const projected = toPublicEntrySeo(stored);
    expect(projected).toEqual({ ...published.seo, title: 'Public title' });
    projected.title = 'Changed copy';
    expect(toPublicEntrySeo(stored).title).toBe('Public title');
    expect(() =>
      toPublicEntrySeo({ ...stored, canonicalUrl: 'javascript:alert(1)' }),
    ).toThrow();

    for (const extra of [
      { document: { type: 'doc', content: [] } },
      { authorId: 'private-user' },
      { status: 'draft' },
      { passwordHash: 'secret-hash' },
      { seo: { ...published.seo, focusKeyword: 'secret-editorial-keyword' } },
      {
        categories: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            name: 'News',
            slug: 'news',
            privateNote: 'secret-note',
          },
        ],
      },
    ]) {
      const client = createContentClient(options({ ...published, ...extra }));
      try {
        await client.getBySlug('published');
        throw new Error('Expected the private payload to be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(CmsApiError);
        expect(error).toMatchObject({
          status: 502,
          code: 'invalid_response',
          message: 'The CMS returned an invalid response',
        });
        expect(JSON.stringify(error)).not.toContain('secret-');
      }
    }
  });

  test('public lists reject private fields nested in their items', async () => {
    // List items have no body; JSON drops the undefined `html`.
    const listed = { ...published, html: undefined };
    const envelope = { items: [listed], total: 1, page: 1, pageSize: 10 };
    expect(await createContentClient(options(envelope)).list()).toEqual(
      envelope,
    );
    await expect(
      createContentClient(
        options({
          ...envelope,
          items: [{ ...listed, authorId: 'private' }],
        }),
      ).list(),
    ).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  test('public settings and authenticated profiles strip undeclared fields', async () => {
    const site = { title: 'Site', description: '', locale: 'en' };
    expect(
      await createContentClient(
        options({ ...site, databasePassword: 'secret', oidcSecret: 'secret' }),
      ).site(),
    ).toEqual({
      ...site,
      icon: null,
      logo: null,
      loginPath: '/login',
      showLogin: true,
    });
    const user = {
      id: 'user',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'editor',
      slug: 'admin',
      bio: '',
      locale: '',
    };
    expect(
      await createAuthClient(
        options({ ...user, passwordHash: 'secret', tokenHash: 'secret' }),
        'session',
      ).me(),
    ).toEqual(user);
  });

  test('public clients never send a session and preserve search/archive filters', async () => {
    const calls: { url: string; authorization: string | null }[] = [];
    const client = createContentClient({
      baseUrl: 'http://localhost:4000',
      fetch: (async (input, init) => {
        calls.push({
          url: String(input),
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return Response.json({
          items: [],
          total: 0,
          page: 2,
          pageSize: 5,
        });
      }) as typeof fetch,
    });
    await client.list({
      search: 'hello world',
      category: 'news',
      tag: 'release',
      page: 2,
      pageSize: 5,
    });
    expect(calls).toEqual([
      {
        url: 'http://localhost:4000/api/v1/content?search=hello+world&category=news&tag=release&page=2&pageSize=5',
        authorization: null,
      },
    ]);
  });
});
