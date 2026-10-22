// Web releases, modelled on ../board: `vite build` writes build/, then this promotes it to
// .web-releases/<content hash>/ and points .active-web-release at it. A running server keeps
// its own release directory, so rebuilding never pulls files from under it; it switches on
// restart. Hashed browser assets of releases retired less than RETENTION ago are linked into
// the kept releases, so pages already open in browsers still load their scripts. Older
// releases are removed on every promotion, so nothing piles up.
import { createHash } from 'node:crypto';
import {
  cp,
  link,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUILD = join(WEB_ROOT, 'build');
const RELEASES = join(WEB_ROOT, '.web-releases');
const ACTIVE = join(WEB_ROOT, '.active-web-release');
const RELEASE_ID = /^[a-f0-9]{24}$/;
const RETENTION = 12 * 60 * 60 * 1000;
/** This release's own hashed assets (relative to client/_app/immutable). */
const OWN = '.own-assets.json';
/** When the release stopped being active. */
const RETIRED = '.retired-at';

const immutable = (release) => join(release, 'client', '_app', 'immutable');

const exists = (path) =>
  stat(path).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );

const listFiles = async (directory, base = directory) => {
  if (!(await exists(directory))) return [];
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path, base)));
    else if (entry.isFile())
      files.push(relative(base, path).split(sep).join('/'));
  }
  return files;
};

const releaseId = async () => {
  const hash = createHash('sha256');
  for (const file of await listFiles(BUILD)) {
    hash.update(file).update('\0');
    hash.update(await readFile(join(BUILD, file))).update('\0');
  }
  return hash.digest('hex').slice(0, 24);
};

const writeAtomically = async (path, text) => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, path);
};

/** The directory the web server should start from: the active release, else build/. */
export const activeRelease = async () => {
  const id = await readFile(ACTIVE, 'utf8').then(
    (text) => text.trim(),
    () => '',
  );
  const release = join(RELEASES, id);
  return RELEASE_ID.test(id) && (await exists(join(release, 'index.js')))
    ? release
    : BUILD;
};

const releaseIds = async () =>
  (await exists(RELEASES))
    ? (await readdir(RELEASES, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && RELEASE_ID.test(entry.name))
        .map((entry) => entry.name)
    : [];

/**
 * Keeps the assets of the active release and of releases retired within the retention
 * window in every kept release, and deletes releases retired longer ago.
 */
const syncReleases = async (active, now) => {
  const kept = [];
  const retained = new Map(); // asset -> release directory that owns it
  for (const id of await releaseIds()) {
    const directory = join(RELEASES, id);
    let retiredAt = null;
    if (id !== active) {
      const marker = join(directory, RETIRED);
      retiredAt = Number(await readFile(marker, 'utf8').catch(() => NaN));
      if (!Number.isFinite(retiredAt)) {
        retiredAt = now;
        await writeFile(marker, `${now}\n`);
      }
    } else await rm(join(directory, RETIRED), { force: true });
    if (retiredAt !== null && now - retiredAt >= RETENTION) {
      await rm(directory, { recursive: true, force: true });
      continue;
    }
    const own = JSON.parse(await readFile(join(directory, OWN), 'utf8'));
    for (const asset of own)
      if (!retained.has(asset)) retained.set(asset, directory);
    kept.push({ directory, own: new Set(own) });
  }
  for (const { directory, own } of kept) {
    const assets = immutable(directory);
    // Drop borrowed assets whose owners expired, then borrow what is missing.
    for (const asset of await listFiles(assets))
      if (!own.has(asset) && !retained.has(asset))
        await rm(join(assets, asset), { force: true });
    for (const [asset, owner] of retained) {
      const target = join(assets, asset);
      if (owner === directory || (await exists(target))) continue;
      await mkdir(join(target, '..'), { recursive: true });
      await link(join(immutable(owner), asset), target).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }
  }
};

/** Copies build/ into its release directory and makes it the active one. */
export const promote = async (now = Date.now()) => {
  if (!(await exists(join(BUILD, 'index.js'))))
    throw new Error('Run `vite build` first: build/index.js is missing.');
  const id = await releaseId();
  const directory = join(RELEASES, id);
  if (!(await exists(join(directory, OWN)))) {
    const staging = `${directory}.${process.pid}.staging`;
    await rm(staging, { recursive: true, force: true });
    await cp(BUILD, staging, { recursive: true });
    await writeFile(
      join(staging, OWN),
      JSON.stringify(await listFiles(immutable(BUILD))),
    );
    await rm(directory, { recursive: true, force: true });
    await rename(staging, directory);
  }
  await syncReleases(id, now);
  await writeAtomically(ACTIVE, `${id}\n`);
  return id;
};

if (import.meta.main) {
  const id = await promote();
  console.info(
    `[web:release] promoted ${id}; restart the web server to use it.`,
  );
}
