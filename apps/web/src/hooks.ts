import type { Transport } from '@sveltejs/kit/hooks';
import { decodeHtml, encodeHtml } from '#lib/theme/html-body.js';

export const transport: Transport = {
  HtmlBody: { encode: encodeHtml, decode: decodeHtml },
};
