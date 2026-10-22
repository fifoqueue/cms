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

  track(release: Unsubscribe): Unsubscribe {
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
