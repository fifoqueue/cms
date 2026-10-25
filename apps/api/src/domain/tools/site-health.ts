import type { PluginInfo, SearchStatus, SiteHealth } from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { JobQueue, TaskLeases } from '#api/domain/jobs/ports';
import type { Clock } from '#api/domain/ports';
import { HealthChecks } from '#api/domain/tools/health-checks';
import { Errors } from '#api/shared/errors';

const OVERDUE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SiteHealthDeps {
  checks?: HealthChecks;
  siteUrl: () => Promise<string>;
  emailEnabled: () => Promise<boolean>;
  search: () => Promise<SearchStatus>;
  leases: Pick<TaskLeases, 'list'>;
  jobs: Pick<JobQueue, 'failures'>;
  plugins: () => Promise<PluginInfo[]>;
  visitorProof: () => boolean;
  info: { cms: string; runtime: string; database: () => Promise<string> };
  clock: Clock;
}

/**
 * Built-ins register through the registry's core-only path and run directly: their errors
 * propagate. A failing plugin check never hides the rest.
 */
export class SiteHealthService {
  private readonly checks: HealthChecks;

  constructor(private readonly deps: SiteHealthDeps) {
    this.checks = deps.checks ?? new HealthChecks();
    this.checks.registerCore('siteUrl', async () => {
      const url = await deps.siteUrl();
      return { status: url ? 'good' : 'recommended', detail: url ? [url] : [] };
    });
    this.checks.registerCore('email', async () => ({
      status: (await deps.emailEnabled()) ? 'good' : 'recommended',
      detail: [],
    }));
    this.checks.registerCore('search', async () => {
      const search = await deps.search();
      return {
        status:
          search.state === 'failing'
            ? 'critical'
            : search.state === 'building' || search.state === 'syncing'
              ? 'recommended'
              : 'good',
        detail: [
          search.state,
          ...(search.lastError
            ? [
                {
                  message: search.lastError,
                  ...(search.lastErrorParams && {
                    params: search.lastErrorParams,
                  }),
                },
              ]
            : []),
        ],
      };
    });
    this.checks.registerCore('scheduler', async () => {
      const tasks = await deps.leases.list();
      const overdue = tasks.filter(
        (task) =>
          deps.clock.now().getTime() - task.nextRunAt.getTime() > OVERDUE_MS,
      );
      const erring = tasks.filter((task) => task.lastError);
      return {
        status: overdue.length
          ? 'critical'
          : erring.length
            ? 'recommended'
            : 'good',
        detail: [...new Set([...overdue, ...erring].map((task) => task.name))],
      };
    });
    this.checks.registerCore('jobs', async () => {
      const failures = (await deps.jobs.failures(20)).filter(
        (failure) =>
          deps.clock.now().getTime() - failure.failedAt.getTime() < DAY_MS,
      );
      return {
        status: failures.length ? 'recommended' : 'good',
        // Job errors are catalog text (`JobFailed`); the kind travels as a param.
        detail: failures.slice(0, 5).map((failure) => ({
          message: Errors.HealthJobFailed,
          params: { kind: failure.kind },
        })),
      };
    });
    this.checks.registerCore('plugins', async () => {
      const failed = (await deps.plugins()).filter(
        (plugin) => plugin.status === 'failed',
      );
      return {
        status: failed.length ? 'recommended' : 'good',
        detail: failed.map((plugin) => plugin.id),
      };
    });
    this.checks.registerCore('visitorProof', () => ({
      status: deps.visitorProof() ? 'good' : 'recommended',
      detail: [],
    }));
  }

  async report(actor: Actor): Promise<SiteHealth> {
    authorize(actor, 'tools.manage');
    const [checks, database] = await Promise.all([
      this.checks.run(),
      this.deps.info.database().catch(() => 'unknown'),
    ]);
    return {
      checks,
      info: {
        cms: this.deps.info.cms,
        runtime: this.deps.info.runtime,
        database,
      },
    };
  }
}
