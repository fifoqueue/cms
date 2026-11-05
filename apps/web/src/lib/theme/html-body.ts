import { Errors } from '#lib/errors.js';

/** The transport sends rendered bodies by DOM reference; data navigations carry their text. */
export class HtmlBody {
  rendered = false;

  constructor(
    readonly html: string,
    readonly key: string,
  ) {}

  toString() {
    return this.html;
  }
}

export const renderHtml = (body: string | HtmlBody) => {
  if (typeof body === 'string') return body;
  body.rendered = true;

  return body.html;
};

export const htmlKey = (body: string | HtmlBody) =>
  body instanceof HtmlBody ? body.key : undefined;

export const encodeHtml = (value: unknown) =>
  value instanceof HtmlBody
    ? ([value.key, value.rendered ? null : value.html] as const)
    : false;

/** Called after the SSR document has been parsed, before Svelte hydrates its body blocks. */
export const decodeHtml = (
  [key, html]: readonly [string, string | null],
  root?: Pick<Document, 'querySelectorAll'>,
) => {
  if (html !== null) return new HtmlBody(html, key);
  const node = [...(root ?? document).querySelectorAll('[data-cms-html]')].find(
    (element) => element.getAttribute('data-cms-html') === key,
  );

  if (!node) throw new Error(Errors.HtmlPayloadMissing);

  return new HtmlBody(node.innerHTML, key);
};
