import { dashboardWidgetSchema, pluginCapabilitySchema } from '@cms/sdk';
import type { DashboardWidget } from '@cms/sdk';
import { can, ROLE_CAPABILITIES } from '@cms/sdk/capabilities';
import { z } from 'zod';
import type { Capability } from '@cms/sdk/capabilities';
import type {
  DashboardWidgetDefinition,
  DashboardWidgetRegistrar,
} from '@cms/sdk/plugin';
import type { Actor } from '#api/domain/auth/authorization';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';

interface Registration {
  owner: string;
  key: string;
  widget: DashboardWidgetDefinition;
  capability: Capability;
}

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Dashboard boxes added by active plugins. Each renders display blocks, isolated and timed out
 * like every plugin call; a failing or invalid widget is logged and left off the dashboard.
 */
export class DashboardWidgetRegistry {
  private registrations: Registration[] = [];

  constructor(
    private readonly options: {
      timeoutMs: number;
      logger: Logger;
      hooks?: HookDispatcher;
    },
  ) {}

  registrar(owner: string): DashboardWidgetRegistrar {
    return {
      dashboardWidget: (key, widget) => {
        if (!KEY.test(key) || key.length > 64)
          throw new Error(Errors.PluginPageKeyInvalid(key));
        const capability = parseInput(
          pluginCapabilitySchema,
          widget.capability,
        );
        const registration = { owner, key, widget, capability };
        this.registrations = [...this.registrations, registration];
        return () => {
          this.registrations = this.registrations.filter(
            (entry) => entry !== registration,
          );
        };
      },
    };
  }

  /** The widgets the actor may see, rendered concurrently, in registration order. */
  async render(actor: Actor): Promise<DashboardWidget[]> {
    const rendered = await Promise.all(
      this.registrations
        .filter((entry) => can(actor, entry.capability))
        .map((entry) => this.renderOne(entry)),
    );
    const widgets = rendered.filter((widget) => widget !== null);
    const capabilities = [
      ...(actor.capabilities ?? ROLE_CAPABILITIES[actor.role] ?? []),
    ];
    const schema = z.object({
      widgets: dashboardWidgetSchema.array(),
      capabilities: z.array(z.string()),
    });
    const filtered = (await this.options.hooks?.applyFilter(
      'dashboard.data',
      { widgets, capabilities },
      (value) => {
        const parsed = schema.safeParse(value);
        if (
          !parsed.success ||
          JSON.stringify(parsed.data.capabilities) !==
            JSON.stringify(capabilities)
        )
          return false;
        const ids = parsed.data.widgets.map(
          (widget) => `${widget.plugin}:${widget.key}`,
        );
        return (
          new Set(ids).size === ids.length &&
          parsed.data.widgets.every((widget) =>
            widgets.some(
              (original) => JSON.stringify(original) === JSON.stringify(widget),
            ),
          )
        );
      },
    )) ?? { widgets, capabilities };
    return filtered.widgets.map((widget) =>
      widgets.find(
        (original) =>
          original.plugin === widget.plugin && original.key === widget.key,
      )!,
    );
  }

  private async renderOne(entry: Registration) {
    const result = await isolate(
      async () =>
        this.registrations.includes(entry)
          ? dashboardWidgetSchema.safeParse({
              plugin: entry.owner,
              key: entry.key,
              title: String(entry.widget.title).slice(0, 100),
              blocks: await entry.widget.render(),
            })
          : null,
      this.options.timeoutMs,
    );
    if (!this.registrations.includes(entry)) return null;
    if (result.ok && result.value?.success) return result.value.data;
    this.options.logger.warn(
      `Plugin "${entry.owner}" dashboard widget "${entry.key}" failed: ${
        result.ok ? 'returned invalid blocks' : result.error.message
      }`,
    );
    return null;
  }
}
