import type {
  SiteSettings,
  PublicSiteDto,
  ReadingSettings,
  PublicReading,
  WritingSettings,
  EmbedSettings,
  PublicEmbedProvider,
  PermalinkSettings,
  SearchSettings,
  MediaStorageSettings,
  DiscussionSettings,
  AdminSeoSettings,
  PublicSeoSettings,
  AdminSecuritySettings,
  EgressSettingsInput,
  AdminEmailSettings,
  SignInSettings,
  SsoSettings,
  SettingValues,
  PublicCommentPage,
} from '#sdk/index';

export type SettingsSection =
  | { section: 'site'; settings: SiteSettings }
  | { section: 'reading'; settings: ReadingSettings }
  | { section: 'writing'; settings: WritingSettings }
  | { section: 'embeds'; settings: EmbedSettings }
  | { section: 'permalinks'; settings: PermalinkSettings }
  | { section: 'membership'; settings: { enabled: boolean } }
  | { section: 'search'; settings: SearchSettings }
  | { section: 'storage'; settings: MediaStorageSettings }
  | { section: 'discussion'; settings: DiscussionSettings }
  | { section: 'seo'; settings: AdminSeoSettings }
  | { section: 'security'; settings: AdminSecuritySettings }
  | { section: 'egress'; settings: EgressSettingsInput }
  | { section: 'email'; settings: AdminEmailSettings }
  | { section: 'sign-in'; settings: SignInSettings }
  | { section: 'sso'; settings: SsoSettings }
  | { section: 'plugin'; id: string; settings: SettingValues };

export type PublicSettingsSection =
  | {
      section: 'discussion';
      settings: Pick<
        PublicCommentPage,
        'requireLogin' | 'fields' | 'pageSize' | 'threadDepth'
      >;
    }
  | { section: 'reading'; settings: PublicReading }
  | { section: 'seo'; settings: PublicSeoSettings }
  | { section: 'embeds'; settings: PublicEmbedProvider[] };

export interface SettingsActionHooks {
  'settings.updated': SettingsSection;
  'plugin.settingsUpdated': { id: string; keys: string[] };
}

export interface SettingsFilterHooks {
  'settings.beforeSave': SettingsSection;
  'site.public': PublicSiteDto;
  'settings.public': PublicSettingsSection;
}
