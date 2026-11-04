import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FunctionsSource } from '#api/functions-runtime/functions-host';
import { versionedSource } from '#api/infra/functions/versioned-source';

/** Snapshot the one source of truth before building so concurrent writes cannot mix versions. */
export class SiteSource {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = resolve(directory);
  }

  async source(): Promise<FunctionsSource | null> {
    let text: string;

    try {
      text = await readFile(join(this.directory, 'site.ts'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    return versionedSource(this.directory, 'functions:site', text);
  }
}
