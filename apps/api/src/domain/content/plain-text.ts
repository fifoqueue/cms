import type { ContentDocument } from '@cms/sdk';

/** Ids of library media the document shows (`mediaId` of media nodes, and video posters' `posterId`). */
export const mediaIdsOf = (document: ContentDocument): string[] => {
  const ids = new Set<string>();
  const stack: unknown[] = [document];

  while (stack.length) {
    const node = stack.pop();
    if (typeof node !== 'object' || node === null) continue;
    const { type, attrs, content } = node as Record<string, unknown>;
    const { mediaId, posterId } =
      (attrs as { mediaId?: unknown; posterId?: unknown } | undefined) ?? {};
    if (
      ['image', 'audio', 'video', 'file'].includes(String(type)) &&
      typeof mediaId === 'string'
    )
      ids.add(mediaId);
    if (type === 'video' && typeof posterId === 'string') ids.add(posterId);
    if (Array.isArray(content))
      for (let index = content.length - 1; index >= 0; index -= 1)
        stack.push(content[index]);
  }
  return [...ids];
};
