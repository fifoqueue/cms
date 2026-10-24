import type { BlockInput } from '@cms/sdk';

/** A block as a built-in theme writes it; `children` is left out for blocks without any. */
export const block = (
  name: string,
  attrs: Record<string, unknown> = {},
  children?: BlockInput[],
): BlockInput => (children ? { name, attrs, children } : { name, attrs });

export const part = (slug: string) => block('template-part', { slug });

export const SANS =
  '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
export const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Noto Serif KR", Georgia, serif';
