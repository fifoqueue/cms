import { publicContentSummarySchema } from '@cms/sdk';
import { plainText, summarize } from '@cms/content/plain-text';
import { parseHtml } from '@cms/content/parse';
import { z } from 'zod';
import type { HookDispatcher } from '#api/domain/ports';
import type { PublishedSummaryRecord } from '#api/domain/content/published-content-repository';

export const filterExcerpt = async (
  hooks: HookDispatcher,
  record: PublishedSummaryRecord,
) => {
  const source = record.excerpt ? 'manual' : 'generated';
  const initial = {
    excerpt: record.protected ? '' : record.excerpt || record.summary,
    contentId: record.id,
    source,
    length: 55,
    more: '…',
  } as const;
  const schema = z.strictObject({
    excerpt: publicContentSummarySchema.shape.excerpt,
    contentId: z.literal(record.id),
    source: z.literal(source),
    length: z.number().int().min(0).max(1000).optional(),
    more: z.string().max(100).optional(),
  });
  const filtered = schema.parse(
    await hooks.applyFilter(
      'content.excerpt',
      initial,
      (value) => schema.safeParse(value).success,
      undefined,
      [{ length: 55, more: '…' }],
    ),
  );
  if (record.protected) return { excerpt: '', generation: null };
  const length = filtered.length ?? 55;
  const more = filtered.more ?? '…';
  if (source === 'generated' && (length !== 55 || more !== '…')) {
    return { excerpt: '', generation: { length, more } };
  }
  return { excerpt: filtered.excerpt, generation: null };
};

export const regenerateExcerpt = (
  html: string,
  { length, more }: { length: number; more: string },
) => {
  const excerpt = summarize(plainText(parseHtml(html)), length);
  return excerpt.endsWith('…') ? `${excerpt.slice(0, -1)}${more}` : excerpt;
};
