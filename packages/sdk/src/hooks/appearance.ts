import type { Menu, MenusSettings, PublicMenuItem } from '#sdk/menus';
import type { WidgetsSettings } from '#sdk/widgets';
import type { AdminTheme, ThemeCustomization } from '#sdk/index';
import type { AdminPattern, PatternInput } from '#sdk/index';

export interface AppearanceActionHooks {
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
  'pattern.beforeSave': PatternInput;
  'menu.beforeSave': MenusSettings;
  'menu.items': PublicMenuItem[];
  'widgets.beforeSave': WidgetsSettings;
}
