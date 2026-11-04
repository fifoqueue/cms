import { hostname } from 'node:os';
import type { createRepositories } from '#api/composition/repositories';
import type { Logger } from '#api/shared/logger';
import { SealedJobs } from '#api/domain/jobs/sealed-jobs';
import { Scheduler } from '#api/domain/jobs/scheduler';
import { JobRunner } from '#api/domain/jobs/job-runner';
import { resealTotpSecrets } from '#api/domain/auth/totp/maintenance';
import { MEDIA_KEY_CATCH_UP } from '#api/infra/prisma/media-key-catch-up';
import { systemClock, uuidV7 } from '#api/infra/system';

type Input = Pick<
  Awaited<ReturnType<typeof createRepositories>>,
  | 'jobQueue'
  | 'taskLeases'
  | 'mediaKeyCatchUp'
  | 'sessions'
  | 'passwordTokens'
  | 'totpSecrets'
  | 'rateLimits'
> & {
  secrets: ConstructorParameters<typeof SealedJobs>[1];
  hooks: ConstructorParameters<typeof JobRunner>[0]['hooks'];
  logger: Logger;
};

export const createJobs = ({
  jobQueue,
  taskLeases,
  mediaKeyCatchUp,
  sessions,
  passwordTokens,
  totpSecrets,
  rateLimits,
  secrets,
  hooks,
  logger,
}: Input) => {
  const owner = `${hostname()}:${process.pid}:${uuidV7.next().slice(-12)}`;
  const sealedJobs = new SealedJobs(jobQueue, secrets);
  const scheduler = new Scheduler({
    leases: taskLeases,
    clock: systemClock,
    logger,
    owner,
  });
  const jobs = new JobRunner({
    hooks,
    queue: jobQueue,
    clock: systemClock,
    logger,
    owner,
  });
  const catchUp = async () => {
    scheduler.add(jobs.task(5000));
    scheduler.add({
      name: MEDIA_KEY_CATCH_UP,
      intervalMs: 5000,
      run: async () => {
        await mediaKeyCatchUp.run();
      },
    });
    await scheduler.runNow(MEDIA_KEY_CATCH_UP);
  };
  const maintenance = () =>
    scheduler.add({
      name: 'maintenance',
      intervalMs: 60 * 60 * 1000,
      run: async () => {
        const now = systemClock.now();
        await sessions.deleteExpired(now);
        await passwordTokens.purge(now);
        const resealed = await resealTotpSecrets({
          secrets: totpSecrets,
          box: secrets,
        });
        logger.info('TOTP secret maintenance', resealed);
        if (resealed.unreadable || resealed.skipped)
          logger.warn(
            'TOTP secrets remain unreadable or changed during maintenance',
            resealed,
          );
        await rateLimits.purge(now);
        await sealedJobs.recover(jobs.kinds());
        await jobs.purge();
      },
    });
  return { sealedJobs, scheduler, jobs, catchUp, maintenance };
};
