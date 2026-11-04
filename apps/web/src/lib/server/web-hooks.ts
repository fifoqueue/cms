import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  WebFilterHookMap,
  WebFunctionsContext,
  WebPageContext,
  WebAsset,
} from '@cms/sdk/functions';
import type { SlotName } from '@cms/sdk';
import type { WebFunctionsScope } from '#lib/server/functions-loader.js';

type HookName = keyof WebFilterHookMap;
type Handler = (value: never, page: WebPageContext) => unknown;
type Entry = {
  name: HookName;
  handler: Handler;
  priority: number;
  observer: boolean;
};
type Slot = {
  name: SlotName;
  render: (page: WebPageContext) => string | Promise<string>;
  priority: number;
};
type Scope = {
  entries: Entry[];
  assets: WebAsset[];
  slots: Slot[];
};

/** Pending registrations become visible together when their scope commits. */
export class WebHookBus {
  private readonly scopes = new Set<Scope>();
  private readonly request = new AsyncLocalStorage<Readonly<WebPageContext>>();

  constructor(private readonly logger: WebFunctionsContext['logger']) {}

  run<T>(page: WebPageContext, render: () => T): T {
    return this.request.run(Object.freeze({ ...page }), render);
  }

  has(name: HookName): boolean {
    return [...this.scopes].some((scope) =>
      scope.entries.some((entry) => entry.name === name),
    );
  }

  scope(owner: string): WebFunctionsScope {
    const scope: Scope = { entries: [], assets: [], slots: [] };
    const request = this.request;
    let disposed = false;
    const add = <T>(items: T[], value: T) => {
      if (!disposed) items.push(value);

      return () => {
        const index = items.indexOf(value);

        if (index >= 0) items.splice(index, 1);
      };
    };
    const logger: WebFunctionsContext['logger'] = {
      info: (message, ...details) =>
        this.logger.info(message, owner, ...details),
      warn: (message, ...details) =>
        this.logger.warn(message, owner, ...details),
      error: (message, ...details) =>
        this.logger.error(message, owner, ...details),
    };

    return {
      context: {
        get page() {
          return request.getStore();
        },
        logger,
        hooks: {
          filter: (name, handler, priority = 10) =>
            add(scope.entries, {
              name,
              handler: handler as Handler,
              priority,
              observer: false,
            }),
          on: (name, handler, priority = 10) =>
            add(scope.entries, {
              name,
              handler: handler as Handler,
              priority,
              observer: true,
            }),
        },
        assets: {
          register: (asset) => add(scope.assets, structuredClone(asset)),
        },
        slots: {
          provide: (name, render, priority = 10) =>
            add(scope.slots, { name, render, priority }),
        },
      },
      commit: () => {
        if (!disposed) this.scopes.add(scope);
      },
      dispose: () => {
        disposed = true;
        this.scopes.delete(scope);
      },
    };
  }

  async apply<K extends HookName>(
    name: K,
    initial: WebFilterHookMap[K],
    page: WebPageContext,
    validate: (value: unknown) => WebFilterHookMap[K],
  ): Promise<WebFilterHookMap[K]> {
    return this.run(page, async () => {
      let value = validate(structuredClone(initial));
      const entries = [...this.scopes]
        .flatMap((scope) => scope.entries)
        .filter((entry) => entry.name === name)
        .sort((a, b) => a.priority - b.priority);
      const context = this.request.getStore()!;

      for (const entry of entries.filter((entry) => !entry.observer)) {
        try {
          value = validate(
            await entry.handler(structuredClone(value) as never, context),
          );
        } catch (error) {
          this.logger.warn('Web filter skipped', name, error);
        }
      }

      for (const entry of entries.filter((entry) => entry.observer)) {
        try {
          await entry.handler(structuredClone(value) as never, context);
        } catch (error) {
          this.logger.error('Web observer skipped', name, error);
        }
      }

      return value;
    });
  }

  assets(validate: (value: unknown) => WebAsset): WebAsset[] {
    return [...this.scopes].flatMap((scope) =>
      scope.assets.flatMap((asset) => {
        try {
          return [validate(structuredClone(asset))];
        } catch (error) {
          this.logger.error('Web asset skipped', error);

          return [];
        }
      }),
    );
  }

  async slot(
    name: SlotName,
    page: WebPageContext,
    sanitize: (html: unknown, name: SlotName) => string,
  ): Promise<string> {
    return this.run(page, async () => {
      const fragments: string[] = [];
      const slots = [...this.scopes]
        .flatMap((scope) => scope.slots)
        .filter((slot) => slot.name === name)
        .sort((a, b) => a.priority - b.priority);

      for (const slot of slots) {
        try {
          fragments.push(
            sanitize(await slot.render(this.request.getStore()!), name),
          );
        } catch (error) {
          this.logger.error('Web slot skipped', name, error);
        }
      }

      return fragments.join('');
    });
  }
}
