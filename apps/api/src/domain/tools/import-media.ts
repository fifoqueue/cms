import type { AdminMedia, ContentDocument } from '@cms/sdk';
import type { MediaService } from '#api/domain/media/media-service';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { Actor } from '#api/domain/auth/authorization';
import type { WxrItem } from '#api/domain/tools/wxr';
import {
  DomainError,
  Errors,
  invalidInput,
  withParams,
} from '#api/shared/errors';
import { attachmentSource } from '#api/domain/tools/attachment-source';

export interface ImportMediaDeps {
  media: Pick<MediaService, 'upload' | 'update' | 'get' | 'maxBytes'>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  settings: SettingsRepository;
}

/** Per request; cached media never consumes a download attempt. */
export interface ImportDownloadBudget {
  remaining: number;
}

export const importMedia = async (
  item: WxrItem,
  actor: Actor,
  deps: ImportMediaDeps,
  budget?: ImportDownloadBudget,
) => {
  const url = new URL(item.attachmentUrl!).href;
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(attachmentSource(url).key),
  );
  const key = `import.media.${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const saved = await deps.settings.get(key);
  let media: AdminMedia | undefined;
  if (typeof saved === 'string') {
    try {
      media = await deps.media.get(saved, actor);
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'not_found')
        throw error;
    }
  }
  if (!media) {
    if (budget) {
      if (budget.remaining === 0)
        throw invalidInput(Errors.ImportDownloadDeferred);
      budget.remaining--;
    }
    const response = await deps.fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    const reader = response.body?.getReader();
    try {
      if (!response.ok || !reader)
        throw invalidInput(Errors.MediaTypeUnsupported);
      if (Number(response.headers.get('content-length')) > deps.media.maxBytes)
        throw invalidInput(
          Errors.MediaTooLarge,
          withParams(Errors.MediaTooLarge, { maxBytes: deps.media.maxBytes }),
        );
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > deps.media.maxBytes)
          throw invalidInput(
            Errors.MediaTooLarge,
            withParams(Errors.MediaTooLarge, { maxBytes: deps.media.maxBytes }),
          );
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      // An admin import is not interactive uploading: skip the hourly limit, keep every check.
      media = await deps.media.upload(
        bytes,
        new URL(url).pathname.split('/').pop() || 'file',
        actor,
        { rateLimit: false },
      );
      await deps.settings.set(key, media.id);
    } finally {
      await reader?.cancel();
    }
  }
  return deps.media.update(
    media.id,
    {
      title: item.title.slice(0, 255),
      alt: (item.meta?._wp_attachment_image_alt ?? '').slice(0, 500),
      caption: item.excerpt.slice(0, 2000),
      description: item.html.slice(0, 10000),
    },
    actor,
  );
};

/** The shared renderer regenerates responsive srcsets from bound library ids. */
export const rewriteMedia = (
  document: ContentDocument,
  sources: ReadonlyMap<string, AdminMedia>,
) => {
  const aliases = new Map<string, AdminMedia>();
  for (const [source, media] of sources)
    aliases.set(attachmentSource(source).key, media);
  const resolve = (value: unknown) => {
    if (typeof value !== 'string') return undefined;
    let source: ReturnType<typeof attachmentSource>;
    let original: ReturnType<typeof attachmentSource>;
    try {
      source = attachmentSource(value);
      original = attachmentSource(value, true);
    } catch {
      return undefined;
    }
    const exact = aliases.get(source.key);
    if (exact) return { media: exact, url: exact.url };
    if (!original.width) return undefined;
    const media = aliases.get(original.key);
    if (!media) return undefined;
    const variant = media.variants.find(
      (v) => v.width === original.width && v.height === original.height,
    );
    return { media, url: variant?.url ?? media.url };
  };
  const visit = (node: Record<string, unknown>) => {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (attrs) {
      for (const key of ['src', 'href', 'link', 'poster']) {
        const found = resolve(attrs[key]);
        if (!found) continue;
        attrs[key] = found.url;
        if (key === 'src') attrs.mediaId = found.media.id;
      }
    }
    for (const mark of (node.marks ?? []) as Record<string, unknown>[])
      visit(mark);
    for (const child of (node.content ?? []) as Record<string, unknown>[])
      visit(child);
  };
  visit(document);
  return document;
};
