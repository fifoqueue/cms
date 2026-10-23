import { z } from 'zod';
import { publicImageSchema } from '#sdk/media';
import { permalinkPathIssue } from '#sdk/permalinks';
import { Errors } from '#sdk/errors';

/** A media library image chosen for the site, or `null`. */
const siteImageId = z.string().trim().min(1).max(36).nullable().default(null);

const LOGIN_ROUTE_CONFLICTS = new Set([
  '/avatars',
  '/comments',
  '/favicon.ico',
  '/media',
  '/oembed',
  '/privacy',
]);

/** Public path that renders the authentication screen. */
export const publicLoginPathSchema = z
  .string()
  .trim()
  .max(200, Errors.LoginPathInvalid)
  .default('/login')
  .superRefine((path, context) => {
    if (
      path === '/' ||
      path.endsWith('/') ||
      path.endsWith('__data.json') ||
      path.endsWith('__route.js') ||
      LOGIN_ROUTE_CONFLICTS.has(path.toLowerCase()) ||
      permalinkPathIssue(path)
    )
      context.addIssue({ code: 'custom', message: Errors.LoginPathInvalid });
  });

export const siteSettingsSchema = z.object({
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().max(500),
  locale: z.string().trim().min(2).max(35),
  /** Site icon (favicon and app icon), a square image of at least 512 pixels. */
  iconId: siteImageId,
  /** Custom logo shown by the `site-logo` block. */
  logoId: siteImageId,
  /** Canonical public authentication path. */
  loginPath: publicLoginPathSchema,
  /** Whether themes show login links and signed-out admin requests redirect there. */
  showLogin: z.boolean().default(true),
});

export type SiteSettings = z.output<typeof siteSettingsSchema>;
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;

/** Public display settings only; credentials and operational settings never belong here. */
export const publicSiteSchema = z.object({
  title: siteSettingsSchema.shape.title,
  description: siteSettingsSchema.shape.description,
  locale: siteSettingsSchema.shape.locale,
  icon: publicImageSchema.nullable().default(null),
  logo: publicImageSchema.nullable().default(null),
  loginPath: siteSettingsSchema.shape.loginPath,
  showLogin: siteSettingsSchema.shape.showLogin,
});
export type PublicSiteDto = z.output<typeof publicSiteSchema>;

/** The stored settings plus the chosen images, so the settings screen can show them. */
export const adminSiteSchema = siteSettingsSchema.extend({
  icon: publicImageSchema.nullable().default(null),
  logo: publicImageSchema.nullable().default(null),
});
export type AdminSiteDto = z.output<typeof adminSiteSchema>;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  title: 'My Site',
  description: '',
  locale: 'en',
  iconId: null,
  logoId: null,
  loginPath: '/login',
  showLogin: true,
};
