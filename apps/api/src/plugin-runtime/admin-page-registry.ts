import {
  adminPageBlocksSchema,
  pluginPageResultSchema,
  settingValuesSchema,
  pluginCapabilitySchema,
} from '@cms/sdk';
import type { PluginPage, PluginPageSummary } from '@cms/sdk';
import { can } from '@cms/sdk/capabilities';
import type { Capability } from '@cms/sdk/capabilities';
import type { AdminPageDefinition, AdminPageRegistrar } from '@cms/sdk/plugin';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { notFound, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

interface Registration {
  owner: string;
  key: string;
  page: AdminPageDefinition;
  capability: Capability;
  actions: Map<string, NonNullable<AdminPageDefinition['actions']>[string]>;
}

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Admin screens added by active plugins. Pages are data (blocks), checked against the block
 * schema; a failing or invalid page renders nothing and is logged, like any plugin failure.
 */
export class AdminPageRegistry {
  private registrations: Registration[] = [];

  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}

  registrar(owner: string): AdminPageRegistrar {
    return {
      page: (key, page) => {
        if (!KEY.test(key) || key.length > 64)
          throw new Error(Errors.PluginPageKeyInvalid(key));
        const capability = parseInput(pluginCapabilitySchema, page.capability);
        const actions = new Map(Object.entries(page.actions ?? {}));
        const registration = { owner, key, page, capability, actions };
        this.registrations = [...this.registrations, registration];
        return () => {
          this.registrations = this.registrations.filter(
            (entry) => entry !== registration,
          );
        };
      },
    };
  }

  /** Pages the actor may open. */
  list(actor: Actor): PluginPageSummary[] {
    return this.registrations
      .filter((entry) => can(actor, entry.capability))
      .map(({ owner, key, page }) => ({
        plugin: owner,
        key,
        title: String(page.title).slice(0, 100),
      }));
  }

  /** The page's blocks; `null` when the plugin failed to describe it. */
  async render(
    plugin: string,
    key: string,
    actor: Actor,
  ): Promise<PluginPage | null> {
    const entry = this.find(plugin, key, actor);
    const blocks = await this.blocks(entry);
    if (!this.registrations.includes(entry))
      throw notFound(Errors.PluginPageNotFound);
    return (
      blocks && {
        plugin,
        key,
        title: String(entry.page.title).slice(0, 100),
        blocks,
      }
    );
  }

  /**
   * Runs a form action with values checked against that form's fields. `null` when the plugin
   * failed; its error stays in the server log.
   */
  async run(
    plugin: string,
    key: string,
    action: string,
    values: unknown,
    actor: Actor,
  ): Promise<{ notice: string | null } | null> {
    const entry = this.find(plugin, key, actor);
    const handler = entry.actions.get(action);
    const form = (await this.blocks(entry))?.find(
      (block) => block.kind === 'form' && block.action === action,
    );
    if (
      typeof handler !== 'function' ||
      form?.kind !== 'form' ||
      !this.registrations.includes(entry)
    )
      throw notFound(Errors.PluginPageNotFound);
    const parsed = parseInput(settingValuesSchema(form.fields), values);
    const result = await isolate(() => {
      if (!this.registrations.includes(entry))
        throw notFound(Errors.PluginPageNotFound);
      return handler(structuredClone(parsed) as never);
    }, this.options.timeoutMs);
    // A dispatched action may already have committed; disposal must not imply it never ran.
    if (!result.ok) {
      this.options.logger.warn(
        `Plugin "${plugin}" page action "${action}" failed: ${result.error.message}`,
      );
      return null;
    }
    const answer = pluginPageResultSchema.safeParse({
      notice:
        (result.value as { notice?: unknown } | undefined)?.notice ?? null,
    });
    return answer.success ? answer.data : { notice: null };
  }

  private find(plugin: string, key: string, actor: Actor) {
    const entry = this.registrations.find(
      (candidate) => candidate.owner === plugin && candidate.key === key,
    );
    if (!entry) throw notFound(Errors.PluginPageNotFound);
    authorize(actor, entry.capability);
    return entry;
  }

  private async blocks(entry: Registration) {
    const result = await isolate(
      async () =>
        this.registrations.includes(entry)
          ? adminPageBlocksSchema.safeParse(await entry.page.render())
          : null,
      this.options.timeoutMs,
    );
    const blocks = result.ok ? result.value : null;
    if (blocks?.success) return blocks.data;
    this.options.logger.warn(
      `Plugin "${entry.owner}" page "${entry.key}" failed: ${
        result.ok ? 'returned invalid blocks' : result.error.message
      }`,
    );
    return null;
  }
}
