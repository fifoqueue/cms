import { installCompleteSchema, installDatabaseSchema } from '@cms/sdk';
import type {
  DatabaseSetupInput,
  InstallationStatus,
  InstallCompleteInput,
  SessionGrant,
} from '@cms/sdk';
import { conflict, unauthorized, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

/** Configuration is durable before configure resolves; complete is atomic. */
export interface InstallationBackend {
  configured(): boolean;
  setupRequired(): Promise<boolean>;
  configure(input: DatabaseSetupInput): Promise<void>;
  complete(input: InstallCompleteInput): Promise<SessionGrant>;
}

export class InstallationService {
  private busy = false;

  constructor(
    private readonly backend: InstallationBackend,
    private readonly validToken: (token: string) => boolean,
  ) {}

  async status(): Promise<InstallationStatus> {
    const databaseConfigured = this.backend.configured();
    return {
      databaseConfigured,
      setupRequired:
        !databaseConfigured || (await this.backend.setupRequired()),
    };
  }

  async database(input: unknown): Promise<InstallationStatus> {
    const { token, ...database } = parseInput(installDatabaseSchema, input);
    return this.exclusive(token, async () => {
      if (this.backend.configured())
        throw conflict(Errors.InstallDatabaseConfigured);
      await this.backend.configure(database);
      return this.status();
    });
  }

  async complete(input: unknown): Promise<SessionGrant> {
    const values = parseInput(installCompleteSchema, input);
    return this.exclusive(values.token, async () => {
      if (!this.backend.configured())
        throw conflict(Errors.InstallDatabaseRequired);
      if (!(await this.backend.setupRequired()))
        throw conflict(Errors.InstallCompleted);
      return this.backend.complete(values);
    });
  }

  private async exclusive<T>(
    token: string,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!this.validToken(token)) throw unauthorized(Errors.InstallKeyInvalid);
    if (this.busy) throw conflict(Errors.InstallBusy);
    this.busy = true;
    try {
      return await task();
    } finally {
      this.busy = false;
    }
  }
}
