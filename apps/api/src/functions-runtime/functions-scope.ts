import { PluginScope } from '#api/plugin-runtime/plugin-scope';
import type { Unsubscribe } from '@cms/sdk/plugin';

/** Registrations become visible together, after asynchronous initialization succeeds. */
export class FunctionsScope extends PluginScope {
  private pending: (() => void)[] | null = [];

  override track(register: () => Unsubscribe): Unsubscribe {
    if (!this.pending) return super.track(register);
    let cancelled = false;
    let release: Unsubscribe | undefined;
    this.pending.push(() => {
      if (!cancelled) release = super.track(register);
    });
    return () => {
      cancelled = true;
      release?.();
    };
  }

  commit(): void {
    const pending = this.pending ?? [];
    this.pending = null;
    for (const register of pending) register();
  }

  override dispose(): void {
    this.pending = null;
    super.dispose();
  }
}
