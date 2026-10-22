import type { SessionGrant } from '@cms/sdk';
import type { UserRepository, SessionRepository } from '#api/domain/auth/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { conflict, Errors } from '#api/shared/errors';
import {
  PrismaUserRepository,
  PrismaSessionRepository,
} from '#api/infra/prisma/auth-repositories';
import { PrismaSettingsRepository } from '#api/infra/prisma/settings-repository';
import type { Database } from '#api/infra/prisma/client';

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
        throw conflict(Errors.InstallCompleted);
      return initialize({
        users: new PrismaUserRepository(transaction),
        sessions: new PrismaSessionRepository(transaction),
        settings: new PrismaSettingsRepository(transaction),
      });
    },
    { timeout: 30_000 },
  );
