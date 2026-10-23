import {
  mkdir,
  rename,
  rm,
  rmdir,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaStorage } from '#api/domain/media/ports';
import { Errors } from '#api/shared/errors';

/** Media files under `root`, keyed by relative path. Writes are atomic (temp file, rename). */
export class FsMediaStorage implements MediaStorage {
  private readonly root: string;
  private readonly spaceLock: string;

  constructor(root: string) {
    this.root = resolve(root);
    this.spaceLock = join(this.root, '.space-lock');
  }

  async commit(
    files: readonly { key: string; bytes: Uint8Array }[],
    freeBytes: number,
  ) {
    await mkdir(this.root, { recursive: true });
    if (!(await this.acquireSpaceLock())) return 'busy' as const;
    try {
      const space = await statfs(this.root);
      const needed = files.reduce(
        (total, file) => total + file.bytes.length,
        0,
      );
      if (space.bavail * space.bsize < freeBytes + needed)
        return 'low_space' as const;
      const written: string[] = [];
      try {
        for (const file of files) {
          await this.write(file.key, file.bytes);
          written.push(file.key);
        }
      } catch (error) {
        await this.remove(written).catch(() => undefined);
        throw error;
      }
      return 'stored' as const;
    } finally {
      await rmdir(this.spaceLock).catch(() => undefined);
    }
  }

  private async write(key: string, bytes: Uint8Array) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path);
  }

  /** `mkdir` is atomic on a shared media volume, so API processes reserve space in turn. */
  private async acquireSpaceLock() {
    const deadline = Date.now() + 5_000;
    for (;;) {
      try {
        await mkdir(this.spaceLock);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const modified = await stat(this.spaceLock).then(
          ({ mtimeMs }) => mtimeMs,
          () => null,
        );
        if (modified === null) continue;
        const age = Date.now() - modified;
        if (age > 2 * 60 * 1000)
          await rmdir(this.spaceLock).catch(() => undefined);
        if (Date.now() >= deadline) return false;
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
    }
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
