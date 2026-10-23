import { describe, expect, test } from 'bun:test';
import { discussionSettingsSchema } from '@cms/sdk';
import { AvatarService } from '#api/domain/comments/avatar-service';
import { GravatarSource } from '#api/infra/gravatar-source';
import { hmacSigner } from '#api/infra/hmac-signer';

const discussion = discussionSettingsSchema.parse({
  showAvatars: true,
  avatarDefault: 'identicon',
});

describe('avatar proxy', () => {
  test('signed comment and author URLs resolve email only on the server', async () => {
    const seen: string[] = [];
    const emails = new Map([
      ['comment:comment-id', 'commenter@example.com'],
      ['author:writer', 'writer@example.com'],
    ]);
    const avatars = new AvatarService(
      { email: async (key) => emails.get(key) ?? null },
      {
        image: async (email) => {
          seen.push(email);
          return { bytes: new Uint8Array([1]), contentType: 'image/png' };
        },
      },
      hmacSigner('avatar-test-secret'),
    );

    for (const key of emails.keys()) {
      const url = avatars.url(key, discussion)!;
      expect(url).toStartWith('/avatars/');
      expect(url).not.toContain('example.com');
      const token = new URL(url, 'https://site.example').pathname
        .split('/')
        .at(-1)!;
      expect(await avatars.image(token, 96, discussion)).toMatchObject({
        contentType: 'image/png',
      });
      expect(await avatars.image(`${token}x`, 96, discussion)).toBeNull();
    }
    expect(seen).toEqual(['commenter@example.com', 'writer@example.com']);
  });

  test('oversized upstream images become a cached local fallback', async () => {
    let requests = 0;
    const source = new GravatarSource(async () => {
      requests += 1;
      return new Response(new Uint8Array([1]), {
        headers: {
          'content-type': 'image/png',
          'content-length': String(513 * 1024),
        },
      });
    });

    const first = await source.image('person@example.com', 'retro', 96);
    const second = await source.image('person@example.com', 'retro', 96);
    expect(first.contentType).toBe('image/svg+xml');
    expect(second).toBe(first);
    expect(requests).toBe(1);
  });
});
