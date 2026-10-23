import { mkdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaStorage } from '#api/domain/media/ports';
import { Errors } from '#api/shared/errors';

/** Media files under `root`, keyed by relative path. Writes are atomic (temp file, rename). */
export class FsMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async available() {
    await mkdir(this.root, { recursive: true });
    const space = await statfs(this.root);
    return space.bavail * space.bsize;
  }

  async write(key: string, bytes: Uint8Array) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path);
  }

  async read(key: string, range?: { start: number; end?: number }) {
    const path = this.path(key);
    const size = await stat(path).then(
      (info) => (info.isFile() ? info.size : null),
      () => null,
    );
    if (size === null) return null;
    const start = Math.min(range?.start ?? 0, Math.max(size - 1, 0));
    const end = Math.min(range?.end ?? size - 1, size - 1);
    return {
      body: Bun.file(path)
        .slice(start, end + 1)
        .stream(),
      size,
      start,
      end,
    };
  }

  async remove(keys: readonly string[]) {
    await Promise.all(keys.map((key) => rm(this.path(key), { force: true })));
  }

  /** Resolves inside the root only; keys are generated, but stay defensive. */
  private path(key: string) {
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep))
      throw new Error(Errors.MediaKeyInvalid);
    return path;
  }
}
