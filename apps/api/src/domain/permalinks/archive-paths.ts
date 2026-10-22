import {
  archiveBasesSchema,
  archivePathsStateSchema,
  resolveArchivePath,
} from '@cms/sdk';
import type { ArchiveBases, ArchivePathsState } from '@cms/sdk';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface ArchivePathRepository {
  read(): Promise<ArchivePathsState>;
  /** Atomically reserves the new bases and preserves previous bases as redirects. */
  save(bases: ArchiveBases): Promise<void>;
}

/** Public archive addresses and their permanent redirects contain no private settings. */
export class ArchivePathsService {
  constructor(private readonly repository: ArchivePathRepository) {}

  async get(): Promise<ArchivePathsState> {
    return parseInput(archivePathsStateSchema, await this.repository.read());
  }

  async update(input: unknown): Promise<ArchivePathsState> {
    const result = archiveBasesSchema.safeParse(input);
    if (!result.success)
      throw invalidInput(
        Errors.InvalidPermalink,
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );

    await this.repository.save(result.data);
    return this.get();
  }

  async resolve(path: string) {
    return resolveArchivePath(await this.get(), path);
  }
}
