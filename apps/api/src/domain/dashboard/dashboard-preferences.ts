import { dashboardPreferencesSchema } from '@cms/sdk';
import type { DashboardPreferences } from '@cms/sdk';
import { authorize } from '#api/domain/auth/authorization';
import type { Actor } from '#api/domain/auth/authorization';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { parseInput } from '#api/shared/validation';

/** Account-owned options, independent of the browser and the currently available widgets. */
export class DashboardPreferencesService {
  constructor(private readonly settings: SettingsRepository) {}

  async get(actor: Actor): Promise<DashboardPreferences> {
    authorize(actor, 'content.create');
    const result = dashboardPreferencesSchema.safeParse(
      await this.settings.get(`dashboard.${actor.id}`),
    );
    return result.success
      ? { order: result.data.order, hidden: result.data.hidden }
      : { order: [], hidden: [] };
  }

  async update(input: unknown, actor: Actor): Promise<DashboardPreferences> {
    authorize(actor, 'content.create');
    const { order, hidden } = parseInput(dashboardPreferencesSchema, input);
    await this.settings.set(`dashboard.${actor.id}`, { order, hidden });
    return { order, hidden };
  }
}
