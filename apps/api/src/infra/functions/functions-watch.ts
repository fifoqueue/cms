import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import type { FunctionsHost } from '#api/functions-runtime/functions-host';
import type { Logger } from '#api/shared/logger';

/** Polling is authoritative; watch events merely reduce local edit latency. */
export class FunctionsWatch {
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly directory: string,
    private readonly host: FunctionsHost,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    await this.host.reconcile();
    this.attach();
    this.interval = setInterval(() => {
      this.attach();
      void this.reload();
    }, 10_000);
  }

  private attach(): void {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.directory, (_event, file) => {
        if (file !== null && file.toString() !== 'site.ts') return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.reload(), 150);
      });
      this.watcher.on('error', (error) => {
        this.logger.warn('Functions watch failed', error);
        this.watcher?.close();
        this.watcher = undefined;
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.logger.warn('Functions watch unavailable', error);
    }
  }

  private async reload(): Promise<void> {
    try {
      await this.host.reconcile();
    } catch (error) {
      this.logger.error('Functions reload failed', error);
    }
  }

  async stop(): Promise<void> {
    clearTimeout(this.timer);
    clearInterval(this.interval);
    this.watcher?.close();
    this.watcher = undefined;
    await this.host.stop();
  }
}
