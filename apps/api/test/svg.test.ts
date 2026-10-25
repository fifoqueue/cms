import { expect, test } from 'bun:test';
import { sanitizeSvg } from '#api/domain/media/svg';

const bytes = (xml: string) => new TextEncoder().encode(xml);
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">${body}</svg>`;

test('CSS resource functions and escaped forms are stripped in both style contexts', () => {
  for (const name of [
    'src',
    'image-set',
    'image',
    'cross-fade',
    'element',
    'paint',
    'unknown',
  ]) {
    expect(() =>
      sanitizeSvg(bytes(wrap(`<path fill="${name}(evil)"/>`))),
    ).toThrow();
    for (const fn of [
      name,
      `\\${name.charCodeAt(0).toString(16)} ${name.slice(1)}`,
    ]) {
      const style = `fill:${fn}(evil)`;
      const result = new TextDecoder().decode(
        sanitizeSvg(
          bytes(wrap(`<style>${style}</style><path style="${style}"/>`)),
        ).bytes,
      );
      expect(result).toContain('<style></style>');
      expect(result).toContain('style=""');
    }
  }
  const safe =
    'fill:rgb(10,20,30);transform:translate(1px,2px);width:calc(10px + var(--x));stroke:url(#a)';
  expect(
    new TextDecoder().decode(
      sanitizeSvg(bytes(wrap(`<path style="${safe}"/>`))).bytes,
    ),
  ).toContain(safe);
});

test('SVG rejects active content, resources, entities and malformed XML', () => {
  for (const xml of [
    wrap('<script>alert(1)</script>'),
    '<svg onload="alert(1)"/>',
    wrap('<use href="javascript:alert(1)"/>'),
    wrap('<use href="https://example.com/x"/>'),
    wrap('<use xlink:href="//example.com/x"/>'),
    wrap('<foreignObject><p>unsafe</p></foreignObject>'),
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    wrap('<path fill="url(https://example.com/x)"/>'),
    wrap('<image href="data:image/svg+xml;base64,AAAA"/>'),
    '<svg><path></svg>',
    '<html><script>x</script></html>',
  ])
    expect(() => sanitizeSvg(bytes(xml))).toThrow();
});
