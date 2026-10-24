import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { sanitizeSvg, SVG_MAX_BYTES } from '#api/domain/media/svg';
import { sniffMediaType } from '#api/domain/media/sniff';

const bytes = (xml: string) => new TextEncoder().encode(xml);
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">${body}</svg>`;

test('sniffing scans adversarial preludes linearly within 4 KB', () => {
  // A regression cannot hang the test runner: the child is killed at the deadline.
  const script = `
    import { sniffMediaType } from ${JSON.stringify(import.meta.resolve('#api/domain/media/sniff'))};
    const bytes = new TextEncoder().encode('<!-- -->'.repeat(500) + '<no>');
    console.log(JSON.stringify(sniffMediaType(bytes)));
  `;
  expect(
    execFileSync(process.execPath, ['-e', script], {
      timeout: 2000,
      encoding: 'utf8',
    }).trim(),
  ).toBe('null');
  expect(
    sniffMediaType(
      bytes('\ufeff \n<?xml version="1.0"?> <!-- x --><!-- y --><svg/>'),
    ),
  ).toBe('image/svg+xml');
  for (const input of [
    '<!-- unfinished',
    '<?xml version="1.0"',
    '<svgx/>',
    ' '.repeat(4096) + '<svg/>',
  ])
    expect(sniffMediaType(bytes(input))).toBeNull();
});

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

test('static SVG is serialized and dimensions come from viewBox', () => {
  const result = sanitizeSvg(bytes(wrap('<path d="M0 0 L10 10"/>')));
  expect(result.width).toBe(640);
  expect(result.height).toBe(480);
  expect(new TextDecoder().decode(result.bytes)).toContain(
    '<path d="M0 0 L10 10"></path>',
  );
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

test('diagram styles and raster data images survive; unsafe CSS is removed', () => {
  const xml = wrap(
    '<style>.box { fill: #fff; stroke: #000 }</style><g style="visibility:visible"><rect class="box" x="10" y="10" width="120" height="60" style="fill:#fff;stroke:#000"/><text x="70" y="40" style="font-size:12px;text-anchor:middle">Diagram</text><image href="data:image/png;base64,iVBORw0KGgo="/></g>',
  );
  expect(new TextDecoder().decode(sanitizeSvg(bytes(xml)).bytes)).toContain(
    'font-size:12px',
  );
  for (const style of [
    '@import "https://example.com/x";',
    'fill:url(https://example.com/x)',
    'expression(alert(1))',
    '-moz-binding:url(x)',
    'behavior:url(x)',
  ]) {
    const output = new TextDecoder().decode(
      sanitizeSvg(
        bytes(
          wrap(
            `<style>${style}</style><path style="${style.replaceAll('"', '&quot;')}"/>`,
          ),
        ),
      ).bytes,
    );
    expect(output).not.toContain('example.com');
    expect(output).not.toContain('expression(');
  }
});

test('SVG input is bounded and internal references remain available', () => {
  expect(() => sanitizeSvg(new Uint8Array(SVG_MAX_BYTES + 1))).toThrow();
  expect(() => sanitizeSvg(bytes(wrap('<use href="#shape"/>')))).not.toThrow();
});
