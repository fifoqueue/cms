import { menuLinkSchema, menuObjectsSchema } from '@cms/sdk';
import type { MenuObjectQuery } from '@cms/sdk';
import type {
  MenuItemProvider,
  MenuResolution,
  MenuLink,
} from '@cms/sdk/plugin';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import { menuObjectQuerySchema } from '@cms/sdk';
import { parseInput } from '#api/shared/validation';
import type { Logger } from '#api/shared/logger';

export class MenuTypeRegistry extends ProviderRegistry<
  MenuResolution,
  MenuLink
> {
  private readonly declarations = new Map<
    object,
    {
      key: string;
      label: string;
      source: string;
      searchable: boolean;
    }
  >();
  private readonly pickers: ProviderRegistry<
    ReturnType<typeof menuObjectQuerySchema.parse>,
    ReturnType<typeof menuObjectsSchema.parse>
  >;

  /** Keys owned by core types; plugin registrations for them are refused. */
  private readonly coreKeys = new Set<string>();
  private readonly logger: Logger;

  constructor(options: { timeoutMs: number; logger: Logger }) {
    super(menuLinkSchema, options);
    this.pickers = new ProviderRegistry(menuObjectsSchema, options);
    this.logger = options.logger;
  }

  override register(owner: string, key: string, provider: MenuItemProvider) {
    if (this.coreKeys.has(key)) {
      this.logger.warn(
        `Menu item type "${key}" is reserved by core; registration from "${owner}" ignored`,
      );
      return () => undefined;
    }
    return this.add(owner, key, provider, false);
  }

  /** Composition-root only: plugin contexts expose `register`. */
  registerCore(key: string, provider: MenuItemProvider) {
    const remove = this.add('core', key, provider, true);
    this.coreKeys.add(key);
    return () => {
      remove();
      this.coreKeys.delete(key);
    };
  }

  private add(
    owner: string,
    key: string,
    provider: MenuItemProvider,
    core: boolean,
  ) {
    const remove = super.register(owner, key, provider, core);
    const token = {};
    if (!core)
      this.declarations.set(token, {
        key,
        label: provider.label ?? key,
        source: owner,
        searchable: !!provider.objects,
      });
    const objects = provider.objects;
    const removePicker = this.pickers.register(
      owner,
      key,
      (query) => (objects ? objects(query) : { items: [], total: 0 }),
      core,
    );
    return () => {
      remove();
      removePicker();
      this.declarations.delete(token);
    };
  }

  types() {
    return [
      ...new Map(
        [...this.declarations.values()].map((value) => [value.key, value]),
      ).values(),
    ];
  }

  async objects(key: string, query: MenuObjectQuery) {
    const input = parseInput(menuObjectQuerySchema, query);
    const result = await this.pickers.resolve(input, key);
    return {
      items: result?.items.slice(0, input.pageSize) ?? [],
      total: result?.total ?? 0,
    };
  }
}
