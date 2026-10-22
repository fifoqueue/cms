import type {
  HealthCheck,
  PluginInfo,
  SearchStatus,
  SiteHealth,
} from '@cms/sdk';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { JobQueue, TaskLeases } from '#api/domain/jobs/ports';
import type { Clock } from '#api/domain/ports';

/** A recurring task this late is not being run by any instance. */
const OVERDUE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SiteHealthDeps {
  siteUrl: () => Promise<string>;
  emailEnabled: () => Promise<boolean>;
  search: () => Promise<SearchStatus>;
  leases: Pick<TaskLeases, 'list'>;
  jobs: Pick<JobQueue, 'failures'>;
  plugins: () => Promise<PluginInfo[]>;
  /** Whether the web server proves visitor addresses (per-visitor rate limits). */
  visitorProof: () => boolean;
  info: { cms: string; runtime: string; database: () => Promise<string> };
  clock: Clock;
}

/** Tools → Site health: configuration and background work that need attention. */
export class SiteHealthService {
  constructor(private readonly deps: SiteHealthDeps) {}

  async report(actor: Actor): Promise<SiteHealth> {
    authorize(actor, 'tools.manage');
    const now = this.deps.clock.now().getTime();
    const [siteUrl, email, search, tasks, failures, plugins, database] =
      await Promise.all([
        this.deps.siteUrl(),
        this.deps.emailEnabled(),
        this.deps.search(),
        this.deps.leases.list(),
        this.deps.jobs.failures(20),
        this.deps.plugins(),
        this.deps.info.database().catch(() => 'unknown'),
      ]);
    const overdue = tasks.filter(
      (task) => now - task.nextRunAt.getTime() > OVERDUE_MS,
    );
    const erring = tasks.filter((task) => task.lastError);
    const recentFailures = failures.filter(
      (failure) => now - failure.failedAt.getTime() < DAY_MS,
    );
    const failed = plugins.filter((plugin) => plugin.status === 'failed');
    const checks: HealthCheck[] = [
      {
        key: 'siteUrl',
        status: siteUrl ? 'good' : 'recommended',
        detail: siteUrl ? [siteUrl] : [],
      },
      { key: 'email', status: email ? 'good' : 'recommended', detail: [] },
      {
        key: 'search',
        status:
          search.state === 'failing'
            ? 'critical'
            : search.state === 'building' || search.state === 'syncing'
              ? 'recommended'
              : 'good',
        detail: [search.state, ...(search.lastError ? [search.lastError] : [])],
      },
      {
        key: 'scheduler',
        status: overdue.length
          ? 'critical'
          : erring.length
            ? 'recommended'
            : 'good',
        detail: [...new Set([...overdue, ...erring].map((task) => task.name))],
      },
      {
        key: 'jobs',
        status: recentFailures.length ? 'recommended' : 'good',
        detail: recentFailures
          .slice(0, 5)
          .map((failure) => `${failure.kind}: ${failure.error}`),
      },
      {
        key: 'plugins',
        status: failed.length ? 'recommended' : 'good',
        detail: failed.map((plugin) => plugin.id),
      },
      {
        key: 'visitorProof',
        status: this.deps.visitorProof() ? 'good' : 'recommended',
        detail: [],
      },
    ];
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
