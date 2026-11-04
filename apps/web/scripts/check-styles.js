// Run after `vite build`: separate builds must retain load-order-independent utility layers.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const client = new URL('../.svelte-kit/output/client/', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('.vite/manifest.json', client), 'utf8'),
);
const assets = new Set(
  Object.values(manifest).flatMap((entry) => [
    ...(entry.css ?? []),
    ...(entry.file.endsWith('.css') ? [entry.file] : []),
  ]),
);
const owners = new Map();
const ordering = new Set();
for (const asset of assets) {
  const css = await readFile(new URL(asset, client), 'utf8');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const layers = [...rules.matchAll(/@layer\s+([^;{]+)[;{]/g)];
  const order = [...new Set(layers.flatMap((match) => match[1].split(',')))];
  for (const match of layers) {
    for (const name of match[1].split(','))
      assert.ok(
        [
          'properties',
          'theme',
          'base',
          'components',
          'utilities',
          'admin-utilities',
        ].includes(name),
        `Unrecognised cascade layer in ${asset}: ${name}`,
      );
    if (!match[0].endsWith('{') || !match[1].includes('utilities')) continue;
    assert.ok(
      ['utilities', 'admin-utilities'].includes(match[1]),
      `Unexpected utility layer in ${asset}: ${match[1]}`,
    );
    assert.ok(!owners.has(match[1]), `Duplicate utility owner: ${match[1]}`);
    owners.set(match[1], asset);
    const header = layers[0];
    assert.equal(
      header?.[0],
      '@layer properties,theme,base,components,utilities,admin-utilities;',
      `${asset}: full explicit order must precede every layer block`,
    );
    assert.ok(!css.includes('cms-layer-order:'), `${asset}: uncompiled marker`);
    ordering.add(header[0]);
  }
  if (order.includes('admin-utilities')) {
    assert.ok(
      order.indexOf('utilities') >= 0 &&
        order.indexOf('utilities') < order.indexOf('admin-utilities'),
      'Admin must establish the public layer before its own even when loaded first',
    );
  }
}
assert.equal(owners.size, 2, 'Both isolated utility builds must exist');
assert.equal(
  ordering.size,
  1,
  'Both builds must declare identical layer order',
);
assert.notEqual(owners.get('utilities'), owners.get('admin-utilities'));
// The higher-priority build must contain every public candidate, not a competing subset.
const adminEntry = new URL('../src/routes/layout.css', import.meta.url);
const publicEntry = new URL('../src/lib/theme/public.css', import.meta.url);
const adminSource = await readFile(adminEntry, 'utf8');
assert.match(adminSource, /@source '\.\.';/);
const scanRoot = fileURLToPath(new URL('../', adminEntry));
const publicSource = await readFile(publicEntry, 'utf8');
for (const match of publicSource.matchAll(/@source ['"]([^'"]+)['"];/g)) {
  const path = relative(
    scanRoot,
    fileURLToPath(new URL(match[1], publicEntry)),
  );
  assert.ok(
    !path.startsWith('..') && !isAbsolute(path),
    'Public source outside admin scan',
  );
}
const nodes = new URL('../server/nodes/', client);
let publicLayout;
let publicPage;
for (const name of await readdir(nodes)) {
  if (!name.endsWith('.js')) continue;
  const code = await readFile(new URL(name, nodes), 'utf8');
  const styles = JSON.parse(
    code.match(/export const stylesheets = (\[[^\n]*\]);/)[1],
  );
  const site = code.includes('/entries/pages/(site)/');
  const admin = code.includes('/entries/pages/admin/');
  if (site || name === '0.js')
    assert.ok(
      !styles.includes(owners.get('admin-utilities')),
      `${name}: admin CSS on public route`,
    );
  if (admin || name === '0.js')
    assert.ok(
      !styles.includes(owners.get('utilities')),
      `${name}: public CSS on admin route`,
    );
  if (code.includes('/entries/pages/(site)/_layout.svelte.js'))
    publicLayout = styles;
  if (code.includes('/entries/pages/(site)/_page.svelte.js'))
    publicPage = styles;
}
assert.ok(publicLayout?.includes(owners.get('utilities')));
assert.ok(publicPage);
let raw = 0;
let gzip = 0;
for (const asset of new Set([...publicLayout, ...publicPage])) {
  const css = await readFile(new URL(asset, client));
  raw += css.length;
  gzip += gzipSync(css).length;
}
// Catches admin utilities leaking into public pages (that build was ~149K raw / ~27.6K gzip)
// while leaving room for ordinary growth from public styles and Tailwind releases.
const PUBLIC_RAW_BUDGET = 120_000;
const PUBLIC_GZIP_BUDGET = 23_500;
assert.ok(
  raw <= PUBLIC_RAW_BUDGET && gzip <= PUBLIC_GZIP_BUDGET,
  `Public CSS exceeds its budget: ${raw} raw / ${gzip} gzip`,
);
console.log(
  `Style isolation passed; public home CSS: ${raw} raw / ${gzip} gzip bytes.`,
);
