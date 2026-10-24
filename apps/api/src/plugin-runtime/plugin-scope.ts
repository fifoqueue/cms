import type { Unsubscribe } from '@cms/sdk/plugin';
import { Errors } from '#api/shared/errors';

/**
 * Everything one activation registered, released in one call.
 * After disposal, late registrations (e.g. from a leftover timer) are rejected.
 */
export class PluginScope {
  private releases: Unsubscribe[] = [];
  private disposed = false;

  get active() {
    return !this.disposed;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error(Errors.PluginInactive);
  }

  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    this.assertActive();
    const result = await operation();
    this.assertActive();
    return result;
  }

  track(register: () => Unsubscribe): Unsubscribe {
    this.assertActive();
    const release = register();
    if (this.disposed) {
      release();
      throw new Error(Errors.PluginInactive);
    }
    this.releases.push(release);
    return () => {
      this.releases = this.releases.filter((entry) => entry !== release);
      release();
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const release of this.releases.splice(0).reverse()) release();
  }
}
