import { z } from 'zod';

const widgetIds = z.array(z.string().min(1).max(200)).max(100);

/** The authenticated user's own dashboard options; never accepts an owner identifier. */
export const dashboardPreferencesSchema = z.strictObject({
  order: widgetIds,
  hidden: widgetIds,
});

export type DashboardPreferences = z.output<typeof dashboardPreferencesSchema>;
