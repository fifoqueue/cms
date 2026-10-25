// Plugin authoring API. A plugin may depend on this module and on `@cms/sdk` only.
import type { PermalinkTokenRegistrar } from '#sdk/permalink-contracts';
import type { CapabilityRegistrar } from '#sdk/capability-contracts';
import type {
  RoleRegistrar,
  ProfileFieldRegistrar,
  CaptchaRegistrar,
  PrivacyEraserRegistrar,
} from '#sdk/user-contracts';
export { permalinkSegmentSchema } from '#sdk/permalink-contracts';
export type {
  PermalinkTokenRegistrar,
  PermalinkTokenResolver,
} from '#sdk/permalink-contracts';
export {
  extensionKeySchema,
  profileFieldSchema,
  profileValuesSchema,
  profileMetaSchema,
  captchaProviderIdSchema,
  captchaWidgetSchema,
  captchaOriginSchema,
  privacyErasureResultSchema,
} from '#sdk/user-contracts';
export type {
  ProfileField,
  ProfileValues,
  CaptchaProviderDefinition,
  CaptchaWidget,
  CaptchaWidgetInput,
  CaptchaVerification,
  PrivacyEraser,
  PrivacyErasureResult,
} from '#sdk/user-contracts';
import type {
  HealthCheckRegistrar,
  JobRegistrar,
} from '#sdk/platform-contracts';
import type {
  MenuItemRegistrar,
  ThemeContributionRegistrar,
  PatternRegistrar,
} from '#sdk/appearance-contracts';
import type {
  SitemapRegistrar,
  SearchEngineRegistrar,
} from '#sdk/discovery-contracts';
export type {
  HealthCheckRegistrar,
  JobRegistrar,
} from '#sdk/platform-contracts';
export type {
  MenuItemRegistrar,
  ThemeContributionRegistrar,
  PatternRegistrar,
} from '#sdk/appearance-contracts';
export type {
  SitemapRegistrar,
  SearchEngineRegistrar,
} from '#sdk/discovery-contracts';
export type {
  MailField,
  MailValues,
  PluginMailTransport,
  MailTransportRegistrar,
} from '#sdk/email';
export type {
  RoleRegistrar,
  ProfileFieldRegistrar,
  CaptchaRegistrar,
  PrivacyEraserRegistrar,
} from '#sdk/user-contracts';
import type { MailTransportRegistrar } from '#sdk/email';
import type {
  ContentTypeRegistrar,
  TaxonomyRegistrar,
  FieldRegistrar,
} from '#sdk/content-contracts';
export type {
  ContentTypeRegistrar,
  TaxonomyRegistrar,
  FieldRegistrar,
} from '#sdk/content-contracts';
export {
  capabilitySchema,
  capabilityDefinitionSchema,
} from '#sdk/capability-contracts';
export type {
  CapabilityDefinition,
  CapabilityRegistrar,
} from '#sdk/capability-contracts';
export {
  outgoingEmailSchema,
  platformImportItemSchema,
  platformWxrItemSchema,
} from '#sdk/hooks/platform';
import type {
  PlatformActionHooks,
  PlatformFilterHooks,
} from '#sdk/hooks/platform';
import type { UserProfile } from '#sdk/auth';
import type {
  AppearanceActionHooks,
  AppearanceFilterHooks,
} from '#sdk/hooks/appearance';
import type { SearchActionHooks, SearchFilterHooks } from '#sdk/hooks/search';
import type { SeoActionHooks, SeoFilterHooks } from '#sdk/hooks/seo';
import type { UserActionHooks, UserFilterHooks } from '#sdk/hooks/users';
import type { MediaActionHooks, MediaFilterHooks } from '#sdk/hooks/media';
import type { MediaProcessorRegistrar } from '#sdk/hooks/media';
import type { ImageSizeRegistrar } from '#sdk/hooks/media';
export type { ImageSize, ImageSizeRegistrar } from '#sdk/hooks/media';
export type { MediaProcessor, MediaProcessorRegistrar } from '#sdk/hooks/media';
import type {
  CommentActionHooks,
  CommentCheckerRegistrar,
  CommentFilterHooks,
} from '#sdk/hooks/comments';
import type {
  ContentActionHooks,
  ContentFilterHooks,
} from '#sdk/hooks/content';
import type { Awaitable, Paginated } from '#sdk/common';
import type {
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
import type { SignInDisplay, SignInField } from '#sdk/sign-in';
import type { SiteSettings } from '#sdk/site';
import type { SlotName } from '#sdk/slots';

export type Unsubscribe = () => void;
export type {
  CommentCheck,
  CommentChecker,
  CommentCheckerRegistrar,
  CommentVerdict,
} from '#sdk/hooks/comments';

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
interface CoreActionHooks {
  /** A session was issued. `method` and `secondFactor` are sign-in method / factor ids. */
  'user.signedIn': {
    user: UserProfile;
    method: string;
    secondFactor: string | null;
  };
  /** A sign-in step was refused. `account` is the email the visitor typed, if any. */
  'user.signInFailed': { method: string; account: string | null };
  'user.secondFactorChanged': {
    user: UserProfile;
    factor: string;
    change: 'enrolled' | 'removed';
  };
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
interface CoreFilterHooks {
  /** Published content (with its body) right before it leaves the public API. */
  'content.public': PublicContent;
  /** A published content list item (no body) right before it leaves the public API. */
  'content.publicSummary': PublicContentSummary;
  /** A visitor's comment right before it is stored. */
  'comment.beforeSave': CommentDraft;
  /**
   * Whether an authenticated user may get a session (WordPress `wp_authenticate_user`). Filters
   * can only refuse: a `true` returned after core said `false` is ignored.
   */
  'user.signInAllowed': { user: UserProfile; method: string; allowed: boolean };
  /** Monotonic: plugins may require another factor, never remove an existing requirement.
   * False after true is ignored and warned. A UV passkey has already satisfied core policy. */
  'user.secondFactorRequired': {
    user: UserProfile;
    method: string;
    required: boolean;
  };
}

/**
 * Every hook. Each domain declares its hooks in `#sdk/hooks/<domain>` (`<Domain>ActionHooks`,
 * `<Domain>FilterHooks`) and joins them here, so domains grow without editing one interface.
 */
export type ActionHookMap = CoreActionHooks &
  SearchActionHooks &
  AppearanceActionHooks &
  PlatformActionHooks &
  ContentActionHooks &
  SeoActionHooks &
  UserActionHooks &
  MediaActionHooks &
  CommentActionHooks;
export type FilterHookMap = CoreFilterHooks &
  PlatformFilterHooks &
  SearchFilterHooks &
  AppearanceFilterHooks &
  UserFilterHooks &
  SeoFilterHooks &
  ContentFilterHooks &
  MediaFilterHooks &
  CommentFilterHooks;

export type ActionName = keyof ActionHookMap;
export type FilterName = keyof FilterHookMap;
export {
  searchHookQuerySchema,
  searchHookResultsSchema,
  searchHookDocumentSchema,
} from '#sdk/hooks/search';
export {
  discoveryFilterSchemas,
  discoveryFilterInputSchema,
} from '#sdk/hooks/seo';
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

/** Field values the browser sent. Untrusted strings; validate them. */
export type SignInValues = Readonly<Record<string, string>>;

/**
 * What a sign-in step produces. `state` (JSON, at most 8 KB) is kept on the server with the
 * pending sign-in and handed back to `continue`; the browser only holds an opaque handle.
 * `failed` answers the visitor uniformly ("invalid credentials"), whatever the reason.
 */
export type SignInOutcome =
  | { kind: 'user'; userId: string }
  | { kind: 'redirect'; url: string; state?: unknown }
  | {
      kind: 'webauthn';
      ceremony: 'get' | 'create';
      /** WebAuthn options JSON (`PublicKeyCredentialRequestOptionsJSON` / `…CreationOptionsJSON`). */
      options: Record<string, unknown>;
      display?: SignInDisplay[];
      state?: unknown;
    }
  | {
      kind: 'fields';
      fields: SignInField[];
      display?: SignInDisplay[];
      message?: string;
      state?: unknown;
    }
  | { kind: 'failed' };

export interface SignInRequest {
  /** The chosen option (`options()`), if the method has any. */
  option: string | null;
  values: SignInValues;
  /** The visitor's address when the frontend proved it. */
  address: string | null;
  /** Verified, normalized visitor identity (IPv4 address/IPv6 /64); null for unproven clients. */
  client?: string | null;
  /** Where a redirect-based method sends the browser back; register it at the provider. */
  callbackUrl: string;
}

export interface SignInContinuation {
  /** The `state` of the previous outcome. */
  state: unknown;
  values: SignInValues;
  /** `PublicKeyCredential.toJSON()` after a `webauthn` outcome. */
  credential: Record<string, unknown> | null;
  /** The query string the browser came back with after a `redirect` outcome. */
  query: string | null;
  address: string | null;
}

/**
 * A primary way to sign in (WordPress `authenticate`). Core's password, passkey and single
 * sign-on use this same contract. A step ends with `user` once the visitor is proven to be that
 * user; core then applies `user.signInAllowed`, the second factor and issues the session.
 * Methods never create users.
 */
export interface SignInMethodDefinition {
  label: string;
  /** Buttons on the login page, e.g. one per configured provider. */
  options?(): Awaitable<{ id: string; label: string }[]>;
  /** Fields of the first step (email, password…); without them the method is a button. */
  fields?: SignInField[];
  /** Whether it can sign anyone in now; methods that are not ready are not offered. Default true. */
  ready?(): Awaitable<boolean>;
  /** Whether `user` can sign in this way now; keeps administrators from locking themselves out. */
  usableBy(user: UserProfile): Awaitable<boolean>;
  begin(request: SignInRequest): Awaitable<SignInOutcome>;
  continue?(step: SignInContinuation): Awaitable<SignInOutcome>;
  /**
   * Sets the method up for `user`, who proved ownership of the account with an emailed
   * invitation or reset link (choosing a password, linking a provider account, registering a
   * passkey). `user` from a setup step must be that same user.
   */
  setup?: {
    /** Setup-specific first-step fields; omission inherits the sign-in fields. */
    fields?: SignInField[];
    begin(user: UserProfile, request: SignInRequest): Awaitable<SignInOutcome>;
    continue?(
      user: UserProfile,
      step: SignInContinuation,
    ): Awaitable<SignInOutcome>;
  };
}

/** A step a second factor asks the user to complete. */
export type SecondFactorChallenge = Extract<
  SignInOutcome,
  { kind: 'fields' | 'webauthn' }
>;

/** A second factor (TOTP, passkey, recovery code, or a plugin's). Never a primary method. */
export interface SecondFactorDefinition {
  label: string;
  /** Whether `user` has this factor set up. */
  enrolled(user: UserProfile): Awaitable<boolean>;
  challenge(user: UserProfile): Awaitable<SecondFactorChallenge>;
  verify(user: UserProfile, step: SignInContinuation): Awaitable<boolean>;
  /** Setting it up, from the account page or while a required factor is missing at sign-in. */
  enroll?: {
    begin(user: UserProfile): Awaitable<SecondFactorChallenge>;
    finish(user: UserProfile, step: SignInContinuation): Awaitable<boolean>;
  };
  /** Individual credentials for the account page (e.g. each passkey). */
  credentials?(
    user: UserProfile,
  ): Awaitable<{ id: string; label: string; createdAt?: string }[]>;
  remove?(user: UserProfile, credentialId: string): Awaitable<void>;
}

/** Local accounts a method resolves to. Read-only: plugins never create users. */
export interface UserDirectory {
  findById(id: string): Promise<UserProfile | null>;
  findByEmail(email: string): Promise<UserProfile | null>;
}

export interface AuthenticationRegistrar {
  /**
   * `key` is kebab-case; the method id becomes `plugin:<plugin id>:<key>`. It signs in only
   * after an administrator allows it in Settings → Sign-in.
   */
  signInMethod(key: string, method: SignInMethodDefinition): Unsubscribe;
  /** `key` is kebab-case; the factor id becomes `plugin:<plugin id>:<key>`. */
  secondFactor(key: string, factor: SecondFactorDefinition): Unsubscribe;
  readonly users: UserDirectory;
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
  readonly healthChecks: HealthCheckRegistrar;
  readonly roles: RoleRegistrar;
  readonly profileFields: ProfileFieldRegistrar;
  readonly captchaProviders: CaptchaRegistrar;
  readonly privacyErasers: PrivacyEraserRegistrar;
  readonly jobs: JobRegistrar;
  readonly contentTypes: ContentTypeRegistrar;
  readonly permalinkTokens: PermalinkTokenRegistrar;
  readonly taxonomies: TaxonomyRegistrar;
  readonly fields: FieldRegistrar;
  readonly capabilities: CapabilityRegistrar;
  readonly mailTransports: MailTransportRegistrar;
  readonly menuItemTypes: MenuItemRegistrar;
  readonly themeContributions: ThemeContributionRegistrar;
  readonly patterns: PatternRegistrar;
  readonly imageSizes: ImageSizeRegistrar;
  readonly sitemaps: SitemapRegistrar;
  readonly searchEngines: SearchEngineRegistrar;
  readonly mediaProcessors: MediaProcessorRegistrar;
  readonly commentCheckers: CommentCheckerRegistrar;
  readonly pluginId: string;
  readonly hooks: HookRegistrar;
  readonly slots: SlotRegistrar;
  readonly widgets: WidgetRegistrar;
  readonly embeds: EmbedRegistrar;
  readonly blocks: BlockRegistrar;
  readonly tasks: TaskRegistrar;
  readonly admin: AdminPageRegistrar & DashboardWidgetRegistrar;
  readonly routes: RouteRegistrar;
  readonly auth: AuthenticationRegistrar;
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
export { providerKeySchema, sitemapPageSchema } from '#sdk/discovery-contracts';
export { menuLinkSchema } from '#sdk/menus';
export {
  themeContributionSchema,
  patternContributionSchema,
} from '#sdk/appearance-contracts';
export type {
  MenuResolution,
  MenuLink,
  MenuItemProvider,
  ThemeContributionRequest,
  ThemeContribution,
  PatternContributions,
} from '#sdk/appearance-contracts';
export type {
  SitemapRequest,
  SitemapPage,
  SitemapProvider,
  SearchRequest,
  SearchHits,
  SearchProvider,
} from '#sdk/discovery-contracts';
