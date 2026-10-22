import { archivePathsStateSchema } from '#sdk/archive-paths';
import { z } from 'zod';
import { publicMenuSchema } from '#sdk/menus';
import { publicReadingSchema } from '#sdk/reading';
import { publicSeoSettingsSchema } from '#sdk/seo';
import { publicSiteSchema } from '#sdk/site';
import { publicThemeSchema } from '#sdk/themes';
import { publicWidgetsSchema } from '#sdk/widgets';

/** Global public data loaded once for one rendered page. */
export const publicLayoutSchema = z.strictObject({
  archives: archivePathsStateSchema.default({
    bases: { category: '/category', tag: '/tag' },
    history: { category: [], tag: [] },
  }),
  site: publicSiteSchema,
  seo: publicSeoSettingsSchema,
  theme: publicThemeSchema,
  reading: publicReadingSchema,
  menus: z.strictObject({
    primary: publicMenuSchema,
    footer: publicMenuSchema,
  }),
  widgets: publicWidgetsSchema,
});

export type PublicLayout = z.output<typeof publicLayoutSchema>;
