import type { SessionGrant } from '@cms/sdk';
import type {
  UserRepository,
  SessionRepository,
} from '../../domain/auth/ports';
import type { SettingsRepository } from '../../domain/site/site-service';
import { conflict } from '../../shared/errors';
import {
  PrismaUserRepository,
  PrismaSessionRepository,
} from './auth-repositories';
import { PrismaSettingsRepository } from './settings-repository';
import type { Database } from './client';

/** The singleton row locks installation across processes, not only requests. */
export const initializeSite = (
  db: Database,
  initialize: (repositories: {
    users: UserRepository;
    sessions: SessionRepository;
    settings: SettingsRepository;
  }) => Promise<SessionGrant>,
) =>
  db.$transaction(
    async (transaction) => {
      await transaction.setting.upsert({
        where: { key: 'installation' },
        create: { key: 'installation', value: 'true' },
        update: { value: 'true' },
      });
      if ((await transaction.user.count()) > 0)
        throw conflict('설치가 이미 완료되었습니다.');
      return initialize({
        users: new PrismaUserRepository(transaction),
        sessions: new PrismaSessionRepository(transaction),
        settings: new PrismaSettingsRepository(transaction),
      });
    },
    { timeout: 30_000 },
  );
