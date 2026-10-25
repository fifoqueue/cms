import { z } from 'zod';
import { publicThemeSchema } from '#sdk/themes';
import { patternInputSchema } from '#sdk/patterns';
import type { Awaitable } from '#sdk/common';
import type { Unsubscribe } from '#sdk/plugin';
import type { MenuItem, menuLinkSchema } from '#sdk/menus';
import type { menuObjectQuerySchema, menuObjectsSchema } from '#sdk/menus';

export interface MenuResolution {
  item: MenuItem;
  content: Record<string, { path: string; title: string }>;
  terms: Record<string, { taxonomy: string; slug: string; name: string }>;
  bases: { category: string; tag: string };
}
export type MenuLink = z.output<typeof menuLinkSchema>;
export type MenuItemProvider = ((
  query: MenuResolution,
) => Awaitable<MenuLink | null>) & {
  label?: string;
  objects?(
    query: z.output<typeof menuObjectQuerySchema>,
  ): Awaitable<z.output<typeof menuObjectsSchema>>;
};
export interface MenuItemRegistrar {
  register(key: string, provider: MenuItemProvider): Unsubscribe;
}

// `.pick()` throws on refined object schemas (zod 4); reuse the field schemas instead.
export const themeContributionSchema = z.object({
  templates: publicThemeSchema.shape.templates,
  parts: publicThemeSchema.shape.parts,
});
export type ThemeContribution = z.output<typeof themeContributionSchema>;
export interface ThemeContributionRequest {
  themeId: string;
  base: ThemeContribution;
}
export interface ThemeContributionRegistrar {
  register(
    key: string,
    provider: (
      query: ThemeContributionRequest,
    ) => Awaitable<ThemeContribution | null>,
  ): Unsubscribe;
}
export const patternContributionSchema = z.array(patternInputSchema).max(100);
export const patternContributionGroupSchema = z.strictObject({
  key: z.string(),
  source: z.string().min(1),
  patterns: patternContributionSchema,
});
export type PatternContributionGroup = z.output<
  typeof patternContributionGroupSchema
>;
export type PatternContributions = z.output<typeof patternContributionSchema>;
export interface PatternRegistrar {
  register(key: string, patterns: PatternContributions): Unsubscribe;
}
