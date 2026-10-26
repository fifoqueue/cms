import { describe, expect, spyOn, test } from 'bun:test';
import { embedSettingsSchema, DEFAULT_EMBED_PROVIDERS } from '@cms/sdk';
import type { EmbedProviderSettings } from '@cms/sdk';
import { EmbedService } from '#api/domain/site/embed-service';
import { Embeds } from '#api/domain/content/embeds';
import { MemorySettings } from '#test/support/memory';

const figure = (url: string) =>
  `<figure data-embed-url="${url}" class="embed"><a href="${url}">${url}</a></figure>`;

describe('embed settings', () => {
  test('rejects invalid patterns and unsafe or unknown template substitutions', () => {
    for (const change of [
      { urlPattern: '[' },
      { urlPattern: 'https://example\\.com/(?<id>[a-z]+)' },
      { src: 'http://player.example/{id}' },
      { src: 'https://{id}.example/embed' },
      { src: 'https://player.example{id}/embed' },
      { src: 'https://player.example/{missing}' },
      { src: 'https://player.example/{id|unsupported}' },
    ]) {
      expect(
        embedSettingsSchema.safeParse({
          providers: [{ ...DEFAULT_EMBED_PROVIDERS[0], ...change }],
        }).success,
      ).toBe(false);
    }
    expect(
      embedSettingsSchema.safeParse({ providers: DEFAULT_EMBED_PROVIDERS })
        .success,
    ).toBe(true);
  });

  test('reads settings once per expansion and sees another instance saving without restart', async () => {
    const repository = new MemorySettings();
    const service = new EmbedService(repository);
    const writer = new EmbedService(repository);
    const get = spyOn(repository, 'get');
    const embeds = new Embeds(() => service.providers());
    const x = figure('https://x.com/jack/status/20');
    expect(await embeds.expand(x)).toContain('<iframe');
    await writer.update({
      providers: [
        ...DEFAULT_EMBED_PROVIDERS.map((provider) => ({
          ...provider,
          enabled: provider.id !== 'x',
        })),
        {
          id: 'custom',
          label: 'Custom',
          enabled: true,
          urlPattern: '^https://example\\.com/(?<id>[a-z]+)$',
          src: 'https://player.example/{id}',
          title: 'Custom player',
          allow: '',
          sizing: { kind: 'ratio', ratio: '4 / 3' },
        },
      ],
    });
    get.mockClear();
    const html = await embeds.expand(x + figure('https://example.com/video'));
    expect(get).toHaveBeenCalledTimes(1);
    expect(html).toStartWith(x);
    expect(html).toContain('src="https://player.example/video"');
    const list = await service.list();
    expect(list.some(({ id }) => id === 'x')).toBe(false);
    expect(list.at(-1)).toEqual({
      id: 'custom',
      label: 'Custom',
      urlPattern: '^https://example\\.com/(?<id>[a-z]+)$',
    });
    for (const provider of list)
      expect(Object.keys(provider).sort()).toEqual([
        'id',
        'label',
        'urlPattern',
      ]);
    const reloaded = new EmbedService(repository);
    expect(await reloaded.list()).toEqual(list);
    expect((await reloaded.providers()).map(({ name }) => name)).not.toContain(
      'x',
    );
  });

  test('core providers saved without a width keep their natural width; custom ones stay full width', async () => {
    const repository = new MemorySettings();
    const custom: EmbedProviderSettings = {
      id: 'custom',
      label: 'Custom',
      enabled: true,
      urlPattern: '^https://example\\.com/(?<id>[a-z]+)$',
      src: 'https://player.example/{id}',
      title: 'Custom post',
      allow: '',
      sizing: { kind: 'height', height: 400 },
    };
    await repository.set('embeds', {
      providers: [
        ...DEFAULT_EMBED_PROVIDERS.map((provider) =>
          provider.sizing.kind === 'height'
            ? {
                ...provider,
                sizing: {
                  kind: 'height',
                  height: provider.sizing.height,
                  heightMessagePath: provider.sizing.heightMessagePath,
                },
              }
            : provider,
        ),
        custom,
      ],
    });
    const service = new EmbedService(repository);
    expect((await service.get()).providers).toEqual([
      ...DEFAULT_EMBED_PROVIDERS,
      custom,
    ]);
    const html = await new Embeds(() => service.providers()).expand(
      figure('https://x.com/jack/status/20') + figure('https://example.com/a'),
    );
    expect(html).toContain('max-width: 550px');
    expect(html).toContain(
      'style="height: 400px; width: 100%; display: block; margin-inline: auto; border: 0"',
    );

    // Clearing the width in the form omits it; it stays uncapped after reload.
    const cleared = (await service.get()).providers.map((provider) =>
      provider.id === 'x' && provider.sizing.kind === 'height'
        ? {
            ...provider,
            sizing: { ...provider.sizing, maxWidth: undefined },
          }
        : provider,
    );
    await service.update(JSON.parse(JSON.stringify({ providers: cleared })));
    const stored = (await repository.get('embeds')) as {
      providers: EmbedProviderSettings[];
    };
    const x = (providers: EmbedProviderSettings[]) =>
      providers.find(({ id }) => id === 'x')!.sizing;
    expect(x(stored.providers)).toMatchObject({ maxWidth: null });
    expect(x((await new EmbedService(repository).get()).providers)).toEqual({
      kind: 'height',
      height: 600,
      heightMessagePath: '/twttr.embed/params/0/height',
      maxWidth: null,
    });
    const uncapped = await new Embeds(() => service.providers()).expand(
      figure('https://x.com/jack/status/20'),
    );
    expect(uncapped).toContain(
      'style="height: 600px; width: 100%; display: block; margin-inline: auto; border: 0"',
    );
    expect(uncapped).not.toContain('max-width');
    expect(uncapped).not.toContain('null');
  });

  test('rejects permission origin lists and unsupported directives at save', async () => {
    const service = new EmbedService(new MemorySettings());
    for (const allow of [
      'camera *; microphone *',
      'fullscreen *',
      'autoplay https://example.com',
      "clipboard-write 'self'",
      'geolocation',
    ]) {
      await expect(
        service.update({
          providers: [{ ...DEFAULT_EMBED_PROVIDERS[0], allow }],
        }),
      ).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(
      service.update({
        providers: [
          {
            ...DEFAULT_EMBED_PROVIDERS[0],
            allow:
              'accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share',
          },
        ],
      }),
    ).resolves.toBeDefined();
  });

  test('rejects backreferences and lookarounds but permits RE2 repetition', () => {
    const accepts = (urlPattern: string) =>
      embedSettingsSchema.safeParse({
        providers: [{ ...DEFAULT_EMBED_PROVIDERS[0], urlPattern }],
      }).success;
    for (const urlPattern of [
      '^https://example\\.com/(?<id>a)(?=b)$',
      '^https://example\\.com/(?<id>a)\\1$',
      '^https://example\\.com/(?<id>a)\\k<id>$',
    ])
      expect(accepts(urlPattern)).toBe(false);
    for (const urlPattern of [
      '^https://example\\.com/(?<id>(a+)+)$',
      '^https://example\\.com/(?<id>a)*$',
      '^https://example\\.com/(?<id>a){2,}$',
      '^https://example\\.com/(?<id>a)(?:b)+?$',
      '^https://example\\.com/(?<id>a)?$',
      '^https://example\\.com/(?<id>a){0,8}$',
      '^https://example\\.com/(?<id>a){2}$',
      '^https://example\\.com/(?<id>[)+*]+)$',
      '^https://example\\.com/(?<id>a)\\)+$',
      '^https://example\\.com/(?<id>a)\\\\1$',
    ])
      expect(accepts(urlPattern)).toBe(true);
  });
});
