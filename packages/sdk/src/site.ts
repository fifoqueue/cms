import { z } from 'zod';

export const siteSettingsSchema = z.object({
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().max(500),
  locale: z.string().trim().min(2).max(35),
});

export type SiteSettings = z.output<typeof siteSettingsSchema>;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  title: 'My Site',
  description: '',
  locale: 'en',
};
