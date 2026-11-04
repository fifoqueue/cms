import type { Menu, MenusSettings, PublicMenuItem } from '#sdk/menus';
import type { PublicWidgets, WidgetsSettings } from '#sdk/widgets';
import type { AdminTheme, PublicTheme, ThemeCustomization } from '#sdk/index';
import type { AdminPattern, PatternInput } from '#sdk/index';
import type { RenderPage } from '#sdk/render';

export interface AppearanceActionHooks {
  'request.notFound': { path: string };
  'theme.setup': {
    theme: { id: string; version: string };
    reason: 'boot' | 'switch' | 'reload';
  };
  'pattern.created': AdminPattern;
  'pattern.updated': AdminPattern;
  'pattern.deleted': AdminPattern;
  'theme.activated': AdminTheme;
  'theme.installed': AdminTheme;
  'theme.deleted': AdminTheme;
  'template.updated': { themeId: string; customization: ThemeCustomization };
  'templatePart.updated': {
    themeId: string;
    customization: ThemeCustomization;
  };
  'styles.updated': { themeId: string; customization: ThemeCustomization };
  'menu.created': Menu;
  'menu.updated': Menu;
  'menu.deleted': Menu;
  'widgets.updated': WidgetsSettings;
}

export interface AppearanceFilterHooks {
  'api.requestAllowed': {
    method: string;
    path: string;
    userId: string | null;
    client: string | null;
    allowed: boolean;
  };
  'api.responseHeaders': {
    method: string;
    path: string;
    status: number;
    headers: Record<string, string>;
  };
  'response.headers': {
    page: RenderPage;
    status: number;
    headers: Record<string, string>;
  };
  'template.candidates': { page: RenderPage; candidates: string[] };
  'page.bodyClasses': { page: RenderPage; classes: string[] };
  'theme.public': PublicTheme;
  'widgets.public': PublicWidgets;
  'editor.allowedBlocks': { type: string; userId: string; blocks: string[] };
  'block.html': {
    name: string;
    attrs: Record<string, unknown>;
    html: string;
  };
  'embed.html': {
    readonly url: string;
    readonly provider: string;
    html: string;
  };
  'pattern.beforeSave': PatternInput;
  'menu.beforeSave': MenusSettings;
  'menu.items': PublicMenuItem[];
  'widgets.beforeSave': WidgetsSettings;
}

export interface AppearanceFilterArgs {
  'block.html': [
    context: { content: { id: string; type: string; slug: string } | null },
  ];
}
