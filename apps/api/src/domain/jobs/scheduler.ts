import type { Clock } from '#api/domain/ports';
import type { TaskLeases } from '#api/domain/jobs/ports';
import type { Logger } from '#api/shared/logger';
import { messageOf } from '#api/shared/errors';

export interface RecurringTask {
  /** Unique across processes; plugin tasks are prefixed with their plugin id. */
  name: string;
  intervalMs: number;
  run(): Promise<void>;
}

export interface SchedulerDeps {
  leases: TaskLeases;
  clock: Clock;
  logger: Logger;
  /** Identifies this process in leases. */
  owner: string;
}

/** A crashed process holds a task at most this long. */
const LEASE_MS = 5 * 60 * 1000;
const RENEW_MS = 60 * 1000;

/**
 * Runs recurring tasks so that each runs in one process at a time across every API instance.
 * `tick` checks every task once; `start` ticks on an interval.
 */
export class Scheduler {
  private readonly tasks = new Map<string, RecurringTask>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private readonly active = new Map<string, { rerun: boolean }>();

  constructor(private readonly deps: SchedulerDeps) {}

  /** Registers `task`; returns a function that unregisters it. */
  add(task: RecurringTask): () => void {
    this.tasks.set(task.name, task);
    return () => {
      if (this.tasks.get(task.name) === task) this.tasks.delete(task.name);
    };
  }

  /** Names of the registered recurring tasks; other lease rows are one-off locks. */
  names(): string[] {
    return [...this.tasks.keys()];
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all(
        [...this.tasks.values()].map((task) => this.run(task, false)),
      );
    } finally {
      this.running = false;
    }
  }

  start(intervalMs: number) {
    this.timer ??= setInterval(() => void this.tick(), intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runNow(name: string): Promise<void> {
    const task = this.tasks.get(name);
    if (task) await this.run(task, true);
  }

  private async run(task: RecurringTask, immediate: boolean) {
    const active = this.active.get(task.name);
    if (active) {
      if (immediate) active.rerun = true;
      return;
    }
    const state = { rerun: false };
    this.active.set(task.name, state);
    try {
      do {
        state.rerun = false;
        await this.runLeased(task, immediate);
        immediate = true;
      } while (state.rerun && this.tasks.get(task.name) === task);
    } catch (error) {
      this.deps.logger.warn(`Task "${task.name}" failed: ${messageOf(error)}`);
    } finally {
      this.active.delete(task.name);
    }
  }

  private async runLeased(task: RecurringTask, ignoreDue: boolean) {
    const { leases, clock, logger, owner } = this.deps;
    try {
      await leases.ensure(task.name);
      if (
        !(await leases.claim(task.name, owner, LEASE_MS, clock.now(), {
          ignoreDue,
        }))
      )
        return;
    } catch (error) {
      logger.warn(
        `Task "${task.name}" could not be scheduled: ${messageOf(error)}`,
      );
      return;
    }
    let failure: string | null = null;
    const renewing = setInterval(
      () =>
        void leases
          .extend(task.name, owner, LEASE_MS, clock.now())
          .catch((error: unknown) =>
            logger.warn(
              `Task "${task.name}" lease could not be renewed: ${messageOf(error)}`,
            ),
          ),
      RENEW_MS,
    );
    try {
      await task.run();
    } catch (error) {
      failure = messageOf(error);
      logger.warn(`Task "${task.name}" failed: ${failure}`);
    } finally {
      clearInterval(renewing);
    }
    const next = new Date(clock.now().getTime() + task.intervalMs);
    await leases
      .release(task.name, owner, next, failure)
      .catch((error: unknown) =>
        logger.warn(
          `Task "${task.name}" could not be released: ${messageOf(error)}`,
        ),
      );
  }
}
