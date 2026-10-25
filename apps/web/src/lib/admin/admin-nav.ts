/**
 * Every admin screen in one place: the sidebar menu, the settings and appearance tabs and the
 * screen search all read these lists, so a screen added here shows up in each of them.
 */
import { resolve } from '$app/paths';
import { default as FileText } from '@lucide/svelte/icons/file-text';
import { default as Files } from '@lucide/svelte/icons/files';
import { default as ImageIcon } from '@lucide/svelte/icons/image';
import { default as LayoutDashboard } from '@lucide/svelte/icons/layout-dashboard';
import { default as MessageSquare } from '@lucide/svelte/icons/message-square';
import { default as Palette } from '@lucide/svelte/icons/palette';
import { default as Pin } from '@lucide/svelte/icons/pin';
import { default as Plug } from '@lucide/svelte/icons/plug';
import { default as SearchCheck } from '@lucide/svelte/icons/search-check';
import { default as Settings } from '@lucide/svelte/icons/settings';
import { default as Users } from '@lucide/svelte/icons/users';
import { default as Wrench } from '@lucide/svelte/icons/wrench';
import type { Component } from 'svelte';
import { can } from '@cms/sdk/capabilities';
import type { Capability } from '@cms/sdk/capabilities';
import { pluralLabel } from '#lib/i18n/index.js';
import type { Messages } from '#lib/i18n/index.js';

/** One admin screen. */
export interface NavEntry {
  /** Built with `resolve()`. */
  href: string;
  label: (m: Messages) => string;
  /** Who may open it; none: every signed-in user. */
  capability?: Capability;
  /** Content screens: the type they belong to. */
  type?: string;
  /** Other words the screen search finds it by (its labels in every language always do). */
  keywords?: readonly string[];
}

/** A sidebar section; its link opens the first entry the user may open. */
export interface NavSection {
  key: string;
  icon: Component;
  label: (m: Messages) => string;
  items: NavEntry[];
  /** Count bubble and its spoken text. */
  badge?: { count: number; label: (m: Messages) => string };
}

export interface NavUser {
  role: string;
  capabilities?: readonly Capability[];
}

/** A plugin's admin page (`data.pluginPages`). */
export interface PluginPage {
  plugin: string;
  key: string;
  title: string;
}

export interface NavContext {
  /** Content types, each with its own section like wp-admin's Posts and Pages. */
  types?: readonly { key: string; pluralName: string; builtin: boolean }[];
  /** Custom taxonomies, listed under Posts after Tags. */
  taxonomies?: readonly { key: string; name: string }[];
  /** What needs attention: comments awaiting moderation, failed plugins. */
  counts?: { comments: number; plugins: number };
}

/** The settings screens, in wp-admin's order first, then this CMS's own: the tabs and the menu. */
export const settingsTabs = (): NavEntry[] => [
  {
    href: resolve('/admin/(app)/settings'),
    label: (m) => m.settingsGeneral,
    capability: 'settings.manage',
    keywords: ['site title', 'language', 'timezone', '사이트 제목', '언어'],
  },
  {
    href: resolve('/admin/(app)/settings/writing'),
    label: (m) => m.settingsWriting,
    capability: 'settings.manage',
  },
  {
    href: resolve('/admin/(app)/settings/embeds'),
    label: (m) => m.embedsTitle,
    capability: 'settings.manage',
    keywords: ['oembed', 'youtube', '유튜브'],
  },
  {
    href: resolve('/admin/(app)/settings/reading'),
    label: (m) => m.settingsReading,
    capability: 'settings.manage',
    keywords: ['homepage', '홈페이지'],
  },
  {
    href: resolve('/admin/(app)/settings/discussion'),
    label: (m) => m.settingsDiscussion,
    capability: 'settings.manage',
    keywords: ['comments', '댓글'],
  },
  {
    href: resolve('/admin/(app)/settings/media-storage'),
    label: (m) => m.settingsMediaStorage,
    capability: 'settings.manage',
    keywords: ['s3', 'upload', '업로드'],
  },
  {
    href: resolve('/admin/(app)/settings/permalinks'),
    label: (m) => m.permalinksTitle,
    capability: 'settings.manage',
    keywords: ['url', 'slug', 'link', '링크', '주소'],
  },
  {
    href: resolve('/admin/(app)/settings/privacy'),
    label: (m) => m.privacySettings,
    capability: 'settings.manage',
  },
  {
    href: resolve('/admin/(app)/settings/email'),
    label: (m) => m.settingsEmail,
    capability: 'settings.manage',
    keywords: ['smtp', 'mail', '메일'],
  },
  {
    href: resolve('/admin/(app)/settings/search'),
    label: (m) => m.settingsSearch,
    capability: 'settings.manage',
  },
  {
    href: resolve('/admin/(app)/settings/security'),
    label: (m) => m.settingsSecurity,
    capability: 'settings.manage',
    keywords: ['captcha', '캡차'],
  },
  {
    href: resolve('/admin/(app)/settings/sign-in'),
    label: (m) => m.settingsSignIn,
    capability: 'settings.manage',
    keywords: ['login', 'passkey', '2fa', '패스키'],
  },
  {
    href: resolve('/admin/(app)/settings/sso'),
    label: (m) => m.settingsSso,
    capability: 'settings.manage',
    keywords: ['sso', 'oauth', 'oidc'],
  },
  {
    href: resolve('/admin/(app)/settings/egress'),
    label: (m) => m.settingsEgress,
    capability: 'egress.manage',
    keywords: ['egress', 'network', 'proxy', '네트워크'],
  },
];

/** The appearance screens: the tabs and the menu. */
export const appearanceTabs = (): NavEntry[] => [
  {
    href: resolve('/admin/(app)/appearance'),
    label: (m) => m.appearanceThemes,
    capability: 'appearance.manage',
  },
  {
    href: resolve('/admin/(app)/appearance/editor'),
    label: (m) => m.navEditor,
    capability: 'appearance.manage',
    keywords: ['templates', 'site editor', '템플릿'],
  },
  {
    href: resolve('/admin/(app)/appearance/menus'),
    label: (m) => m.appearanceMenus,
    capability: 'appearance.manage',
    keywords: ['navigation', '내비게이션'],
  },
  {
    href: resolve('/admin/(app)/appearance/widgets'),
    label: (m) => m.appearanceWidgets,
    capability: 'appearance.manage',
  },
];

/** A content type's section: its list and its new-entry screen. */
const typeSection = (
  type: { key: string; pluralName: string; builtin: boolean },
  extra: NavEntry[] = [],
): NavSection => {
  const query: `?${string}` = `?type=${encodeURIComponent(type.key)}`;
  return {
    key: `type-${type.key}`,
    icon: type.key === 'page' ? Files : type.key === 'post' ? Pin : FileText,
    label: (m) => pluralLabel(m, type),
    items: [
      {
        href: resolve(`/admin/(app)/content${query}`),
        label: (m) => m.navAllOf(pluralLabel(m, type)),
        capability: 'content.create',
        type: type.key,
      },
      {
        href: resolve(`/admin/(app)/content/new${query}`),
        label: (m) => m.navAddNew,
        capability: 'content.create',
        type: type.key,
        keywords: ['new', 'write', 'create', '새', '작성'],
      },
      ...extra,
    ],
  };
};

/** wp-admin style sections, before checking what the user may open. */
export const adminSections = ({
  types = [],
  taxonomies = [],
  counts = { comments: 0, plugins: 0 },
}: NavContext): NavSection[] => {
  const post = types.find((type) => type.key === 'post');
  const pages = types.find((type) => type.key === 'page');
  const others = types.filter(
    (type) => type.key !== 'post' && type.key !== 'page',
  );
  // Categories, tags and custom taxonomies sit under Posts, as in wp-admin.
  const termEntries: NavEntry[] = [
    {
      href: resolve('/admin/(app)/categories'),
      label: (m) => m.navCategories,
      capability: 'taxonomy.manage',
    },
    {
      href: resolve('/admin/(app)/tags'),
      label: (m) => m.navTags,
      capability: 'taxonomy.manage',
    },
    ...taxonomies.map((taxonomy): NavEntry => ({
      href: resolve('/admin/(app)/taxonomies/[taxonomy]', {
        taxonomy: taxonomy.key,
      }),
      label: () => taxonomy.name,
      capability: 'taxonomy.manage',
    })),
  ];
  return [
    {
      key: 'dashboard',
      icon: LayoutDashboard,
      label: (m) => m.dashboard,
      items: [
        {
          href: resolve('/admin/(app)'),
          label: (m) => m.dashboard,
          capability: 'content.create',
        },
      ],
    },
    post
      ? typeSection(post, termEntries)
      : {
          key: 'content',
          icon: FileText,
          label: (m) => m.navContent,
          items: [
            {
              href: resolve('/admin/(app)/content'),
              label: (m) => m.navAllContent,
              capability: 'content.create',
            },
            ...termEntries,
          ],
        },
    {
      key: 'media',
      icon: ImageIcon,
      label: (m) => m.navMedia,
      items: [
        {
          href: resolve('/admin/(app)/media'),
          label: (m) => m.navMedia,
          capability: 'media.upload',
          keywords: ['images', 'files', 'upload', '이미지', '파일'],
        },
      ],
    },
    ...(pages ? [typeSection(pages)] : []),
    ...others.map((type) => typeSection(type)),
    {
      key: 'comments',
      icon: MessageSquare,
      label: (m) => m.navComments,
      badge: {
        count: counts.comments,
        label: (m) => m.dashboardComments(counts.comments),
      },
      items: [
        {
          href: resolve('/admin/(app)/comments'),
          label: (m) => m.navComments,
          capability: 'comments.moderate',
          keywords: ['moderation', 'spam', '스팸'],
        },
      ],
    },
    {
      key: 'appearance',
      icon: Palette,
      label: (m) => m.navAppearance,
      items: [
        ...appearanceTabs(),
        {
          href: resolve('/admin/(app)/patterns'),
          label: (m) => m.patternsTitle,
          capability: 'content.create',
        },
      ],
    },
    {
      key: 'plugins',
      icon: Plug,
      label: (m) => m.navPlugins,
      badge: {
        count: counts.plugins,
        label: (m) => m.navPluginsFailed(counts.plugins),
      },
      items: [
        {
          href: resolve('/admin/(app)/plugins'),
          label: (m) => m.navPlugins,
          capability: 'plugins.manage',
          keywords: ['extensions', '확장'],
        },
      ],
    },
    {
      key: 'users',
      icon: Users,
      label: (m) => m.navUsers,
      items: [
        {
          href: resolve('/admin/(app)/users'),
          label: (m) => m.navAllUsers,
          capability: 'users.manage',
          keywords: ['roles', 'members', '역할', '회원'],
        },
        {
          href: resolve('/admin/(app)/account'),
          label: (m) => m.navAccount,
          keywords: ['profile', 'password', '프로필', '비밀번호'],
        },
      ],
    },
    {
      key: 'tools',
      icon: Wrench,
      label: (m) => m.navTools,
      items: [
        {
          href: resolve('/admin/(app)/tools/health'),
          label: (m) => m.toolsHealth,
          capability: 'tools.manage',
          keywords: ['status', 'diagnostics', '진단'],
        },
        {
          href: resolve('/admin/(app)/tools/privacy/[action]', {
            action: 'export',
          }),
          label: (m) => m.privacyExport,
          capability: 'users.manage',
          keywords: ['gdpr'],
        },
        {
          href: resolve('/admin/(app)/tools/privacy/[action]', {
            action: 'erase',
          }),
          label: (m) => m.privacyErase,
          capability: 'users.manage',
          keywords: ['gdpr', 'delete'],
        },
        {
          href: resolve('/admin/(app)/tools/transfer'),
          label: (m) => m.toolsTransfer,
          capability: 'tools.manage',
          keywords: ['backup', 'wordpress', '백업', '워드프레스'],
        },
        {
          href: resolve('/admin/(app)/tools/webhooks'),
          label: (m) => m.toolsWebhooks,
          capability: 'tools.manage',
          keywords: ['hooks', 'integrations', '훅', '연동'],
        },
      ],
    },
    {
      key: 'seo',
      icon: SearchCheck,
      label: (m) => m.navSeo,
      items: [
        {
          href: resolve('/admin/(app)/seo'),
          label: (m) => m.navSeo,
          capability: 'settings.manage',
          keywords: ['sitemap', 'robots', '검색 엔진', '사이트맵'],
        },
      ],
    },
    {
      key: 'settings',
      icon: Settings,
      label: (m) => m.navSettings,
      items: [
        ...settingsTabs(),
        {
          href: resolve('/admin/(app)/fields'),
          label: (m) => m.navFields,
          capability: 'fields.manage',
          keywords: ['custom fields', '사용자 정의 필드'],
        },
      ],
    },
  ];
};

/** The entries the user may open. */
export const allowedEntries = (entries: readonly NavEntry[], user: NavUser) =>
  entries.filter((entry) => !entry.capability || can(user, entry.capability));

/**
 * The sections as the user sees them: only entries they may open, plugin pages under Plugins
 * (the API checks those, so they are listed as given), and no empty sections.
 */
export const visibleSections = (
  sections: readonly NavSection[],
  user: NavUser,
  pluginPages: readonly PluginPage[],
): NavSection[] =>
  sections
    .map((section) => ({
      ...section,
      items: [
        ...allowedEntries(section.items, user),
        ...(section.key === 'plugins'
          ? pluginPages.map(({ plugin, key, title }): NavEntry => ({
              href: resolve('/admin/(app)/extensions/[plugin]/[key]', {
                plugin,
                key,
              }),
              label: () => title,
              keywords: [plugin],
            }))
          : []),
      ],
    }))
    .filter((section) => section.items.length > 0);
