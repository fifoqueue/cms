import { installCompleteSchema, installDatabaseSchema } from '@cms/sdk';
import type {
  DatabaseSetupInput,
  InstallationStatus,
  InstallCompleteInput,
  SessionGrant,
} from '@cms/sdk';
import { conflict, unauthorized } from '../../shared/errors';
import { parseInput } from '../../shared/validation';

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
        throw conflict('데이터베이스 연결은 이미 설정되었습니다.');
      await this.backend.configure(database);
      return this.status();
    });
  }

  async complete(input: unknown): Promise<SessionGrant> {
    const values = parseInput(installCompleteSchema, input);
    return this.exclusive(values.token, async () => {
      if (!this.backend.configured())
        throw conflict('먼저 데이터베이스를 연결해 주세요.');
      if (!(await this.backend.setupRequired()))
        throw conflict('설치가 이미 완료되었습니다.');
      return this.backend.complete(values);
    });
  }

  private async exclusive<T>(
    token: string,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!this.validToken(token))
      throw unauthorized('서버 콘솔의 설치 키를 확인해 주세요.');
    if (this.busy)
      throw conflict('설치가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
    this.busy = true;
    try {
      return await task();
    } finally {
      this.busy = false;
    }
  }
}
