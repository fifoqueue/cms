import type { WidgetDefinition, WidgetRegistrar } from '@cms/sdk/plugin';
import type { PluginWidgets } from '#api/domain/appearance/widget-service';
import { isolate } from '#api/shared/isolate';
import type { Logger } from '#api/shared/logger';
import { Errors } from '#api/shared/errors';

interface Registration {
  type: string;
  owner: string;
  widget: WidgetDefinition;
}

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Widget types added by plugins. A widget of an inactive plugin is not shown. */
export class WidgetRegistry implements PluginWidgets {
  private registrations: Registration[] = [];

  constructor(
    private readonly options: { timeoutMs: number; logger: Logger },
  ) {}

  registrar(owner: string): WidgetRegistrar {
    return {
      provide: (key, widget) => {
        if (!KEY.test(key)) throw new Error(Errors.PluginWidgetKeyInvalid(key));
        const registration = { type: `plugin:${owner}:${key}`, owner, widget };
        this.registrations = [...this.registrations, registration];
        return () => {
          this.registrations = this.registrations.filter(
            (entry) => entry !== registration,
          );
        };
      },
    };
  }

  types() {
    return this.registrations.map(({ type, widget }) => ({
      type,
      name: String(widget.name),
    }));
  }

  async render(type: string, settings: Record<string, unknown>) {
    const registration = this.registrations.find(
      (entry) => entry.type === type,
    );
    if (!registration) return null;
    const result = await isolate(
      () => registration.widget.render(structuredClone(settings)),
      this.options.timeoutMs,
    );
    if (result.ok && typeof result.value === 'string') return result.value;
    this.options.logger.warn(
      `Plugin "${registration.owner}" failed to render widget "${type}": ${result.ok ? 'returned a non-string value' : result.error.message}`,
    );
    return null;
  }
}
