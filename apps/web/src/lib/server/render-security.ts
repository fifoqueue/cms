import type { WebAsset } from '@cms/sdk/functions';
import type { WebHeadTag } from '@cms/sdk/functions';
import { acceptsResponseHeaders } from '@cms/sdk';

/** Web caching stays core-owned; additions obey the shared immutable-header policy. */
export const renderHeaders = (
  headers: Headers,
  additions: Record<string, string>,
) => {
  for (const [name, value] of Object.entries(additions)) {
    const key = name.toLowerCase();

    const previous = Object.fromEntries(headers);

    if (!acceptsResponseHeaders({ ...previous, [key]: value }, previous, true))
      continue;
    headers.set(key, value);
  }
};

/** Asset origins widen only the directive governing that asset kind. */
export const withAssetOrigins = (
  policy: string,
  assets: readonly WebAsset[],
  base: URL,
) =>
  policy
    .split(',')
    .map((part) => {
      const directives = part
        .split(';')
        .map((value) => value.trim().split(/\s+/))
        .filter(([name]) => name);

      for (const kind of ['script', 'style'] as const) {
        const origins = [
          ...new Set(
            assets
              .filter((asset) => asset.kind === kind)
              .map((asset) => new URL(asset.src, base).origin)
              .filter((origin) => origin !== base.origin),
          ),
        ];

        if (!origins.length) continue;
        let directive =
          directives.find(([name]) => name === `${kind}-src-elem`) ??
          directives.find(([name]) => name === `${kind}-src`);

        if (!directive) {
          const fallback = directives.find(([name]) => name === 'default-src');

          if (!fallback) continue;
          directive = [`${kind}-src`, ...fallback.slice(1)];
          directives.push(directive);
        }

        if (directive[1] === "'none'") directive.splice(1, 1);
        directive.push(
          ...origins.filter((origin) => !directive.includes(origin)),
        );
      }

      return directives.map((directive) => directive.join(' ')).join('; ');
    })
    .join(', ');

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );

export const headTagHtml = (tag: WebHeadTag) =>
  `<${tag.tag}${Object.entries(tag.attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escape(value!)}"`)
    .join('')}>`;

/** `assetHtml` marked with the asset's key (`data-cms-asset`), so the page can tell it is present. */
export const keyedAssetHtml = (asset: WebAsset) =>
  assetHtml(asset).replace(
    /^<(script|link)/,
    `<$1 data-cms-asset="${escape(asset.key)}"`,
  );

/** Callers supply validated assets; every string is escaped for an attribute value. */
export const assetHtml = (asset: WebAsset) => {
  const attrs = asset.attrs;
  const extra = [
    attrs.integrity ? ` integrity="${escape(attrs.integrity)}"` : '',
    attrs.crossorigin ? ` crossorigin="${escape(attrs.crossorigin)}"` : '',
  ].join('');

  if (asset.kind === 'style')
    return `<link rel="stylesheet" href="${escape(asset.src)}"${extra}>`;

  return `<script src="${escape(asset.src)}"${extra}${attrs.module ? ' type="module"' : ''}${attrs.defer ? ' defer' : ''}${attrs.async ? ' async' : ''}></script>`;
};
