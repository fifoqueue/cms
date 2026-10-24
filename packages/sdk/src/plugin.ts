// Plugin authoring API. A plugin may depend on this module and on `@cms/sdk` only.
import type { UserProfile } from '#sdk/auth';
import type { Awaitable, Paginated } from '#sdk/common';
import type {
  ContentData,
  ContentEntry,
  PublicContent,
  PublicContentListQuery,
  PublicContentSummary,
} from '#sdk/content';
import type { CommentStatus } from '#sdk/comments';
import type { AdminMedia } from '#sdk/media';
import type { Capability } from '#sdk/capabilities';
import type {
  AdminBlock,
  PluginBlockField,
  PluginManifest,
  SettingValue,
  SettingValues,
} from '#sdk/plugins';
import type { SiteSettings } from '#sdk/site';
import type { SlotName } from '#sdk/slots';

export type Unsubscribe = () => void;

/** A stored comment as plugins see it (including the private email address). */
export interface PluginComment {
  id: string;
  contentId: string;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
}

/**
 * A visitor's comment about to be stored. Filters may change `body` and `status` (for example
 * to mark spam); every other field is kept as the visitor sent it.
 */
export interface CommentDraft {
  contentId: string;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  body: string;
  status: Exclude<CommentStatus, 'trash'>;
}

/** Notifications. Handlers run after the fact and cannot change the outcome. */
export interface ActionHookMap {
  'content.created': ContentEntry;
  'content.updated': ContentEntry;
  'content.published': ContentEntry;
  'content.deleted': ContentEntry;
  /** Moved to the trash; it is no longer public. */
  'content.trashed': ContentEntry;
  'content.restored': ContentEntry;
  'media.uploaded': AdminMedia;
  'media.deleted': AdminMedia;
  'site.updated': SiteSettings;
  'comment.created': PluginComment;
  'comment.statusChanged': PluginComment & { previousStatus: CommentStatus };
}

/** Transformations. Each handler receives the previous handler's output. Invalid output is discarded. */
export interface FilterHookMap {
  /** Validated content right before it is stored. */
  'content.beforeSave': ContentData;
  /** Published content (with its body) right before it leaves the public API. */
  'content.public': PublicContent;
  /** A published content list item (no body) right before it leaves the public API. */
  'content.publicSummary': PublicContentSummary;
  /** A visitor's comment right before it is stored. */
  'comment.beforeSave': CommentDraft;
}

export type ActionName = keyof ActionHookMap;
export type FilterName = keyof FilterHookMap;
export type ActionHandler<K extends ActionName> = (
  payload: Readonly<ActionHookMap[K]>,
) => Awaitable<void>;
export type FilterHandler<K extends FilterName> = (
  value: FilterHookMap[K],
) => Awaitable<FilterHookMap[K]>;

export interface HookRegistrar {
  on<K extends ActionName>(name: K, handler: ActionHandler<K>): Unsubscribe;
  /** Lower priority runs first. Default 10. */
  filter<K extends FilterName>(
    name: K,
    handler: FilterHandler<K>,
    priority?: number,
  ): Unsubscribe;
}

export interface SlotContext {
  slot: SlotName;
  /** Path of the page being rendered by the frontend. */
  path: string;
  site: SiteSettings;
  /** The content shown on the page, if any. */
  content: PublicContent | null;
}

/** Returns an HTML fragment. Return an empty string to contribute nothing. */
export type SlotRenderer = (context: SlotContext) => Awaitable<string>;

export interface SlotRegistrar {
  provide(slot: SlotName, renderer: SlotRenderer): Unsubscribe;
}

/** A widget admins can place in a widget area; `render` returns escaped HTML. */
export interface WidgetDefinition {
  /** Shown in the Widgets screen. */
  name: string;
  /** `settings` are the options saved with the placed widget (untrusted JSON). */
  render(settings: Record<string, unknown>): Awaitable<string>;
}

export interface WidgetRegistrar {
  /** `key` is kebab-case; the widget type becomes `plugin:<plugin id>:<key>`. */
  provide(key: string, widget: WidgetDefinition): Unsubscribe;
}

/**
 * Turns a link pasted into the editor's embed block into a player. Return the player HTML, or
 * `null` when the address is not yours. Core providers (YouTube, Vimeo) are asked first.
 */
export interface EmbedProvider {
  name: string;
  render(url: URL): Awaitable<string | null>;
}

export interface EmbedRegistrar {
  register(provider: EmbedProvider): Unsubscribe;
}

/** What a plugin block is rendered for: the entry being served. */
export interface BlockRenderContext {
  content: {
    id: string;
    type: string;
    slug: string;
    path: string;
    title: string;
  } | null;
}

/**
 * A block authors insert in the editor (WordPress `register_block_type` with a render
 * callback). `attributes` are declared like settings, plus `select`; the editor builds the form.
 */
export interface BlockDefinition {
  title: string;
  description?: string;
  attributes?: PluginBlockField[];
  /**
   * Returns escaped HTML for the stored attributes (defaults applied). Runs when content is
   * served, with a time limit; failures render nothing.
   */
  render(attrs: SettingValues, context: BlockRenderContext): Awaitable<string>;
}

export interface BlockRegistrar {
  /** `key` is kebab-case; the block is stored as `plugin:<plugin id>:<key>`. */
  register(key: string, block: BlockDefinition): Unsubscribe;
}

export interface TaskRegistrar {
  /**
   * Runs `task` every `intervalMs` (at least one minute) in one API instance at a time.
   * `name` is kebab-case and unique within the plugin.
   */
  every(
    name: string,
    intervalMs: number,
    task: () => Awaitable<void>,
  ): Unsubscribe;
}

/** A screen of the plugin in the admin area, described as blocks. */
export interface AdminPageDefinition {
  title: string;
  /** Who may open it and run its actions. Default `plugins.manage`. */
  capability?: Capability;
  render(): Awaitable<AdminBlock[]>;
  /** Handlers of the page's `form` blocks, by action name. Values follow the form's fields. */
  actions?: Record<
    string,
    (values: SettingValues) => Awaitable<{ notice?: string } | void>
  >;
}

export interface AdminPageRegistrar {
  /** `key` is kebab-case; the page appears under the plugin's name in the admin menu. */
  page(key: string, page: AdminPageDefinition): Unsubscribe;
}

/** A box on the admin dashboard, described as display blocks (no `form` blocks). */
export interface DashboardWidgetDefinition {
  title: string;
  /** Who sees it. Default `plugins.manage`. */
  capability?: Capability;
  render(): Awaitable<AdminBlock[]>;
}

export interface DashboardWidgetRegistrar {
  /** `key` is kebab-case. A failing or invalid widget is left off the dashboard. */
  dashboardWidget(key: string, widget: DashboardWidgetDefinition): Unsubscribe;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PluginRequest {
  request: Request;
  url: URL;
  params: Record<string, string>;
  /** The signed-in user, or `null` for anonymous requests to public routes. */
  user: UserProfile | null;
}

export interface PluginRoute {
  method: HttpMethod;
  /** Elysia path starting with `/`, relative to `/api/plugins/<plugin-id>`. Examples: `/items/:id`, `/files/*` (rest in `params['*']`). */
  path: string;
  access: 'public' | 'admin';
  handler: (request: PluginRequest) => Awaitable<Response>;
}

export interface RouteRegistrar {
  add(route: PluginRoute): Unsubscribe;
}

/** Values of the settings declared in the manifest, with manifest defaults applied. */
export interface SettingsReader {
  get(key: string): Promise<SettingValue | undefined>;
  all(): Promise<SettingValues>;
}

/** Storage private to the plugin. Values must be JSON-serializable. Deleted with the plugin. */
export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Read access to published content. Results are not passed through the `content.public` filter. */
export interface ContentReader {
  list(query?: PublicContentListQuery): Promise<Paginated<PublicContent>>;
  getBySlug(slug: string): Promise<PublicContent | null>;
}

export interface PluginLogger {
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
}

/**
 * Supported host APIs, not a JavaScript sandbox. Installing a bundle executes trusted server
 * code (including module evaluation). Hooks can receive private editorial/comment data.
 * Registrations and data access through this context are revoked on deactivation; already
 * started work and arbitrary JavaScript cannot be cancelled.
 */
export interface PluginContext {
  readonly pluginId: string;
  readonly hooks: HookRegistrar;
  readonly slots: SlotRegistrar;
  readonly widgets: WidgetRegistrar;
  readonly embeds: EmbedRegistrar;
  readonly blocks: BlockRegistrar;
  readonly tasks: TaskRegistrar;
  readonly admin: AdminPageRegistrar & DashboardWidgetRegistrar;
  readonly routes: RouteRegistrar;
  readonly settings: SettingsReader;
  readonly storage: KeyValueStore;
  readonly content: ContentReader;
  readonly logger: PluginLogger;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  /** Register hooks, slots and routes here. Never perform side effects at module top level. */
  activate(context: PluginContext): Awaitable<void>;
  /**
   * Release resources the context does not track, such as timers. The scope is disposed
   * before this callback: context settings/storage/content calls are no longer permitted.
   */
  deactivate?(): Awaitable<void>;
}

/** Identity helper for type inference. A plugin bundle exports its definition as `plugin`. */
export const definePlugin = (definition: PluginDefinition): PluginDefinition =>
  definition;
