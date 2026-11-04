import { publicContentSchema } from '@cms/sdk';
import type { PublicContent } from '@cms/sdk';
import { parseHtml } from '@cms/content/parse';
import { renderDocument } from '@cms/content/render';
import { z } from 'zod';
import type { HookDispatcher } from '#api/domain/ports';

/** Changed HTML goes through the same document schema and renderer as imported content. */
export const filterHtml = async (
  hooks: HookDispatcher | undefined,
  html: string,
  content: Pick<PublicContent, 'id' | 'type' | 'slug' | 'path' | 'title'>,
  context: 'single' | 'feed' | 'preview',
): Promise<string> => {
  if (!hooks?.has('content.html')) return html;
  const schema = z
    .object({
      html: publicContentSchema.shape.html,
      content: z
        .object({
          id: z.literal(content.id),
          type: z.literal(content.type),
          slug: z.literal(content.slug),
          path: z.literal(content.path),
          title: z.literal(content.title),
        })
        .strict(),
      context: z.literal(context),
    })
    .strict();
  const sanitized = new Map([[html, html]]);
  const filtered = await hooks.applyFilter(
    'content.html',
    { html, content, context },
    (value) => {
      const result = schema.safeParse(value);
      if (!result.success) return false;
      const next = result.data.html;
      if (!sanitized.has(next))
        sanitized.set(next, renderDocument(parseHtml(next)));
      return true;
    },
  );
  return sanitized.get(filtered.html)!;
};
