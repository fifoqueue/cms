import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Errors, invalidInput, withParams } from '#api/shared/errors';

/** A separate ceiling keeps XML parsing and serialization bounded. */
export const SVG_MAX_BYTES = 1024 * 1024;

const elements = new Set(
  'svg g defs path rect circle ellipse line polyline polygon text tspan title desc use symbol clipPath mask linearGradient radialGradient stop style image'.split(
    ' ',
  ),
);
const attributes = new Set(
  'id class style version viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray paint-order opacity offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod clip-path clip-rule mask text-anchor font-size font-family font-weight preserveAspectRatio href xlink:href'.split(
    ' ',
  ),
);
type XmlNode = Record<string, unknown>;
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const reject = (): never => {
  throw invalidInput(Errors.MediaTypeUnsupported);
};

const cssFunctions = new Set(
  'rgb rgba hsl hsla calc min max clamp var translate translatex translatey rotate scale scalex scaley matrix skew skewx skewy'.split(
    ' ',
  ),
);

/** Normalize escapes, then permit only static color/math/transform functions. */
const css = (value: string) => {
  const decoded = value.replace(
    /\\(?:([0-9a-f]{1,6})[ \t\r\n\f]?|(\r\n|[\r\n\f])|([\s\S]))/gi,
    (
      _match,
      hex: string | undefined,
      newline: string | undefined,
      char: string | undefined,
    ) => {
      if (hex) {
        const code = Number.parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : '\ufffd';
      }
      return newline ? '' : char!;
    },
  );
  // eslint-disable-next-line no-control-regex -- a decoded NUL must reject the declaration
  if (/[\\<>@]|\u0000|\/\*|-moz-binding|behavior/i.test(decoded)) return '';
  const checked = decoded.replace(
    /url\(\s*(['"]?)#[A-Za-z_][\w.-]*\1\s*\)/gi,
    '',
  );
  for (const match of checked.matchAll(/[-\w\u0080-\uffff]+\s*/g))
    if (
      checked[match.index + match[0].length] === '(' &&
      !cssFunctions.has(match[0].trim().toLowerCase())
    )
      return '';
  return decoded;
};

const raster = (value: string) => {
  const match =
    /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!match) return false;
  let data: string;
  try {
    data = atob(match[2]!);
  } catch {
    return false;
  }
  return match[1] === 'png'
    ? data.startsWith('\x89PNG\r\n\x1a\n')
    : match[1] === 'jpeg'
      ? data.startsWith('\xff\xd8\xff')
      : match[1] === 'gif'
        ? /^GIF8[79]a/.test(data)
        : data.startsWith('RIFF') && data.slice(8, 12) === 'WEBP';
};

/**
 * A deliberately small static SVG profile. Unsupported active features are
 * rejected, not repaired. Serialization emits only allowlisted parsed nodes;
 * source bytes, XML declarations and namespace declarations are never copied.
 * No browser DOM, resource loading or external entity resolver is involved.
 */
export const sanitizeSvg = (bytes: Uint8Array) => {
  if (bytes.byteLength > SVG_MAX_BYTES)
    throw invalidInput(
      Errors.MediaTooLarge,
      withParams(Errors.MediaTooLarge, { maxBytes: SVG_MAX_BYTES }),
    );
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return reject();
  }
  if (
    /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)|<!\[CDATA\[/i.test(xml) ||
    /&(?!(?:amp|lt|gt|quot|apos);|#\d+;|#x[\da-f]+;)/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    return reject();
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
  });
  let nodes: XmlNode[];
  try {
    nodes = parser.parse(xml) as XmlNode[];
  } catch {
    return reject();
  }
  nodes = nodes.filter(
    (node) =>
      !('?xml' in node) && !('#text' in node && !String(node['#text']).trim()),
  );
  if (nodes.length !== 1 || !('svg' in nodes[0]!)) return reject();
  let count = 0;
  const render = (node: XmlNode, depth: number): string => {
    if (++count > 10_000 || depth > 64) return reject();
    if ('#text' in node) return escape(String(node['#text']));
    const name = Object.keys(node).find((key) => key !== ':@');
    if (!name || !elements.has(name)) return reject();
    const attrs = (node[':@'] ?? {}) as Record<string, string>;
    const output: string[] = [];
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'xmlns' && value === 'http://www.w3.org/2000/svg') continue;
      if (key === 'xmlns:xlink' && value === 'http://www.w3.org/1999/xlink')
        continue;
      if (!attributes.has(key)) return reject();
      if (key === 'style') {
        output.push(` style="${escape(css(value))}"`);
        continue;
      }
      if (key === 'href' || key === 'xlink:href') {
        if (
          !/^#[A-Za-z_][\w.-]*$/.test(value) &&
          !(name === 'image' && raster(value))
        )
          return reject();
      } else if (/url\s*\(/i.test(value)) {
        if (!/^url\(#[A-Za-z_][\w.-]*\)$/.test(value)) return reject();
        // eslint-disable-next-line no-control-regex -- control characters in an attribute are refused
      } else if (/[\\@:]|[\u0000-\u001f]/.test(value)) return reject();
      else if (value.trim() && !css(value)) return reject();
      output.push(` ${key}="${escape(value)}"`);
    }
    const children = node[name];
    if (!Array.isArray(children)) return reject();
    if (name === 'style') {
      if (children.some((child: XmlNode) => !('#text' in child)))
        return reject();
      const text = children
        .map((child: XmlNode) => String(child['#text']))
        .join('');
      return `<style>${escape(css(text))}</style>`;
    }
    const namespace =
      depth === 0
        ? ' xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
        : '';
    return `<${name}${namespace}${output.join('')}>${children
      .map((child: XmlNode) => render(child, depth + 1))
      .join('')}</${name}>`;
  };
  const sanitized = new TextEncoder().encode(render(nodes[0]!, 0));
  if (sanitized.byteLength > SVG_MAX_BYTES)
    throw invalidInput(
      Errors.MediaTooLarge,
      withParams(Errors.MediaTooLarge, { maxBytes: SVG_MAX_BYTES }),
    );
  const root = (nodes[0]![':@'] ?? {}) as Record<string, string>;
  const viewBox = root.viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const box =
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    viewBox[2]! > 0 &&
    viewBox[3]! > 0
      ? viewBox
      : null;
  const dimension = (
    value: string | undefined,
    fallback: number | undefined,
  ) => {
    const number =
      value && /^\d+(?:\.\d+)?(?:px)?$/.test(value)
        ? Number(value.replace(/px$/, ''))
        : fallback;
    return number && Number.isFinite(number) && number > 0
      ? Math.ceil(number)
      : null;
  };
  return {
    bytes: sanitized,
    width: dimension(root.width, box?.[2]),
    height: dimension(root.height, box?.[3]),
  };
};
