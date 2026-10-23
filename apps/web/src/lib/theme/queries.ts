import type { Block } from '@cms/sdk';

/** What an independent post list selects; layout attributes never change its results. */
export interface QuerySelection {
  type: string;
  category: string;
  tag: string;
  author: string;
  count: number;
}

/** The selection of a `query` or `latest-posts` block (latest posts list posts by default). */
export const selectionOf = (
  block: Extract<Block, { name: 'query' | 'latest-posts' }>,
): QuerySelection =>
  block.name === 'query'
    ? {
        type: block.attrs.type,
        category: block.attrs.category,
        tag: block.attrs.tag,
        author: block.attrs.author,
        count: block.attrs.count,
      }
    : {
        type: block.attrs.type || 'post',
        category: '',
        tag: '',
        author: '',
        count: block.attrs.count,
      };

/** Equal selections share one request and one result. */
export const queryKey = (selection: QuerySelection) =>
  JSON.stringify([
    selection.type,
    selection.category,
    selection.tag,
    selection.author,
    selection.count,
  ]);
