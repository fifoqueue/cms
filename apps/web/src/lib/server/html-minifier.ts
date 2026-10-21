import { minify } from '@swc/html';
import type { Options } from '@swc/html';

/**
 * Minifies markup syntax and the contents of inline scripts and styles while keeping every node
 * the browser builds: comments are Svelte hydration markers, whitespace text nodes are counted
 * during hydration and may be visible under CSS `white-space`, and attribute values may be read
 * by selectors or scripts.
 *
 * One exception has no option: the minifier always trims and collapses whitespace inside
 * `<title>`. The title browsers display (`document.title`) is unchanged, and Svelte hydrates
 * the title by setting `document.title` rather than walking its text node, but
 * `<title>.textContent` reads the collapsed text until the title is set again.
 */
const options: Options = {
  scriptingEnabled: true,
  collapseWhitespaces: 'none',
  removeComments: false,
  removeEmptyMetadataElements: false,
  removeEmptyAttributes: false,
  removeRedundantAttributes: 'none',
  collapseBooleanAttributes: false,
  normalizeAttributes: false,
  sortAttributes: false,
  sortSpaceSeparatedAttributeValues: false,
  tagOmission: false,
  minifyJs: true,
  minifyCss: { lib: 'lightningcss' },
  // The JSON minifier reorders object keys, which changes what consumers enumerate.
  minifyJson: false,
};

/** Minifies a complete HTML document. A document with parse errors is returned unchanged. */
export const minifyHtml = async (html: string): Promise<string> => {
  const { code, errors } = await minify(html, options);

  return errors?.length ? html : code;
};

/**
 * Creates a `transformPageChunk` for one response. SvelteKit may split a page into chunks that
 * are not well-formed on their own and marks only the last with `done`, so chunks are held back
 * and the joined document is minified once it is complete.
 */
export const createPageMinifier = () => {
  let pending = '';

  return async ({
    html,
    done,
  }: {
    html: string;
    done: boolean;
  }): Promise<string> => {
    pending += html;

    if (!done) return '';

    const page = pending;
    pending = '';

    return minifyHtml(page);
  };
};
