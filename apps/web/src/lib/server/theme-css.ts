import { createHash } from 'node:crypto';
import { scopedCss } from '#lib/theme/style.js';

/** Hash the served bytes, including the scoping rules. */
export const themeCss = (css: string) => {
  const body = scopedCss(css);
  return {
    body,
    hash: createHash('sha256').update(body).digest('hex'),
  };
};
