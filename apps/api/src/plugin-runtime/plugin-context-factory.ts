import type { ResolvedManifest, ContentDocument } from '@cms/sdk';
import { PermalinkTokenRegistry } from '#api/domain/permalinks/token-registry';
import { HealthChecks } from '#api/domain/tools/health-checks';
import type { PluginHealthChecks } from '#api/domain/tools/health-checks';
import { taxonomyDefinitionSchema, fieldDefinitionSchema } from '@cms/sdk';
import type { TaxonomyDefinition, FieldDefinition } from '@cms/sdk';
import { DefinitionRegistry } from '#api/domain/content/definition-registry';
import { BUILTIN_TAXONOMIES } from '#api/domain/taxonomy/taxonomy-types';
import type { JobRegistrar } from '@cms/sdk/plugin';
import type { PluginJobs } from '#api/domain/jobs/plugin-jobs';
import { ContentTypeRegistry } from '#api/domain/content/content-type-registry';
import { BUILTIN_TYPES } from '#api/domain/content/content-types';
import { CapabilityRegistry } from '#api/domain/users/capability-registry';
import { RoleRegistry } from '#api/domain/users/role-registry';
import { ProfileFields } from '#api/domain/users/profile-fields';
import { CaptchaRegistry } from '#api/domain/security/captcha-registry';
import { EraserRegistry } from '#api/domain/privacy/eraser-registry';
import type { MailTransportRegistry } from '#api/domain/email/transport-registry';
import type { UserDirectory } from '@cms/sdk/plugin';
import type { SignInRegistry } from '#api/plugin-runtime/sign-in-registry';
import type {
  ActionHandler,
  ActionName,
  ContentReader,
  FilterHandler,
  FilterName,
  PluginContext,
  PluginLogger,
} from '@cms/sdk/plugin';
import type { HookBus } from '#api/plugin-runtime/hook-bus';
import type { PluginScope } from '#api/plugin-runtime/plugin-scope';
import type { PluginSettings } from '#api/plugin-runtime/plugin-settings';
import type { EmbedRegistry } from '#api/plugin-runtime/embed-registry';
import type { BlockRegistry } from '#api/plugin-runtime/block-registry';
import type { AdminPageRegistry } from '#api/plugin-runtime/admin-page-registry';
import type { DashboardWidgetRegistry } from '#api/plugin-runtime/dashboard-widget-registry';
import type {
  PluginDataRepository,
  TaskScheduler,
} from '#api/plugin-runtime/ports';
import { isolate } from '#api/shared/isolate';
import type { PluginRouteRegistry } from '#api/plugin-runtime/route-registry';
import type { SlotRegistry } from '#api/plugin-runtime/slot-registry';
import type { WidgetRegistry } from '#api/plugin-runtime/widget-registry';
import { Errors } from '#api/shared/errors';
import { CommentCheckers } from '#api/domain/comments/comment-checkers';
import { MediaProcessors } from '#api/domain/media/media-processors';
import { ImageSizes } from '#api/domain/media/image-sizes';
import {
  themeContributionSchema,
  patternContributionSchema,
} from '@cms/sdk/plugin';
import type {
  ThemeContributionRequest,
  ThemeContribution,
  PatternContributions,
} from '@cms/sdk/plugin';
import { ProviderRegistry } from '#api/plugin-runtime/provider-registry';
import { MenuTypeRegistry } from '#api/plugin-runtime/menu-type-registry';
import { sitemapPageSchema, searchHookResultsSchema } from '@cms/sdk/plugin';
import type {
  SitemapRequest,
  SitemapPage,
  SearchRequest,
  SearchHits,
} from '@cms/sdk/plugin';

export interface PluginContextServices {
  patternRenderer?: { render(document: ContentDocument): string };
  /** Plugin registrations only; core checks are registered by `SiteHealthService`. */
  healthChecks?: PluginHealthChecks;
  roles?: RoleRegistry;
  profileFields?: ProfileFields;
  captchaProviders?: CaptchaRegistry;
  privacyErasers?: EraserRegistry;
  jobs?: PluginJobs;
  contentTypes?: ContentTypeRegistry;
  permalinkTokens?: PermalinkTokenRegistry;
  taxonomies?: DefinitionRegistry<TaxonomyDefinition>;
  fields?: DefinitionRegistry<FieldDefinition>;
  capabilities?: CapabilityRegistry;
  mailTransports?: MailTransportRegistry;
  menuItemTypes?: MenuTypeRegistry;
  themeContributions?: ProviderRegistry<
    ThemeContributionRequest,
    ThemeContribution
  >;
  patterns?: ProviderRegistry<null, PatternContributions>;
  imageSizes?: ImageSizes;
  sitemaps?: ProviderRegistry<SitemapRequest, SitemapPage>;
  searchEngines?: ProviderRegistry<SearchRequest, SearchHits>;
  mediaProcessors?: MediaProcessors;
  commentCheckers?: CommentCheckers;
  authentication: SignInRegistry;
  users: UserDirectory;
  hooks: HookBus;
  slots: SlotRegistry;
  widgets: WidgetRegistry;
  embeds: EmbedRegistry;
  blocks: BlockRegistry;
  scheduler: TaskScheduler;
  pages: AdminPageRegistry;
  dashboardWidgets: DashboardWidgetRegistry;
  routes: PluginRouteRegistry;
  data: PluginDataRepository;
  settings: PluginSettings;
  content: ContentReader;
  logger: (pluginId: string) => PluginLogger;
}

const STORAGE_KEY = /^[\w.:-]{1,191}$/;
const TASK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Plugin tasks run at most this often. */
const MIN_TASK_INTERVAL_MS = 60_000;
/** A plugin task is abandoned (and logged) after this long. */
const TASK_TIMEOUT_MS = 60_000;

const checkKey = (key: string) => {
  if (!STORAGE_KEY.test(key))
    throw new Error(Errors.PluginStorageKeyInvalid(key));
  return key;
};

/** Builds the capabilities handed to `activate`. Every registration is tracked by the scope. */
export class PluginContextFactory {
  constructor(private readonly services: PluginContextServices) {
    services.contentTypes ??= new ContentTypeRegistry(BUILTIN_TYPES);
    services.permalinkTokens ??= new PermalinkTokenRegistry();
    services.taxonomies ??= new DefinitionRegistry(
      taxonomyDefinitionSchema,
      BUILTIN_TAXONOMIES,
    );
    services.fields ??= new DefinitionRegistry(fieldDefinitionSchema);
    services.capabilities ??= new CapabilityRegistry();
    const options = { timeoutMs: 3000, logger: services.logger('core') };
    services.roles ??= new RoleRegistry();
    services.profileFields ??= new ProfileFields();
    services.captchaProviders ??= new CaptchaRegistry(options);
    services.privacyErasers ??= new EraserRegistry(options);
    services.menuItemTypes ??= new MenuTypeRegistry(options);
    services.themeContributions ??= new ProviderRegistry(
      themeContributionSchema,
      options,
    );
    services.patterns ??= new ProviderRegistry(
      patternContributionSchema,
      options,
    );
    services.sitemaps ??= new ProviderRegistry(sitemapPageSchema, options);
    services.searchEngines ??= new ProviderRegistry(
      searchHookResultsSchema,
      options,
    );
  }

  create(manifest: ResolvedManifest, scope: PluginScope): PluginContext {
    const {
      hooks,
      slots,
      widgets,
      embeds,
      blocks,
      scheduler,
      pages,
      dashboardWidgets,
      routes,
      data,
      settings,
      content,
      logger,
    } = this.services;
    const id = manifest.id;
    const hookRegistrar = hooks.registrar(id);
    const slotRegistrar = slots.registrar(id);
    const widgetRegistrar = widgets.registrar(id);
    const embedRegistrar = embeds.registrar(id);
    const blockRegistrar = blocks.registrar(id);
    const pageRegistrar = pages.registrar(id);
    const widgetBoxes = dashboardWidgets.registrar(id);
    const log = logger(id);
    const routeRegistrar = routes.registrar(id);
    const auth = this.services.authentication.registrar(
      id,
      this.services.users,
    );

    return Object.freeze({
      permalinkTokens: {
        register: (key, resolver) =>
          scope.track(() =>
            this.services.permalinkTokens!.register(key, resolver),
          ),
      },
      roles: {
        register: (role) =>
          scope.track(() => this.services.roles!.register(role, id)),
      },
      profileFields: {
        register: (key, field) =>
          scope.track(() =>
            this.services.profileFields!.register(id, key, field),
          ),
      },
      captchaProviders: {
        register: (key, provider) =>
          scope.track(() =>
            this.services.captchaProviders!.register(
              ['turnstile', 'hcaptcha', 'recaptcha'].includes(key)
                ? key
                : `plugin:${id}:${key}`,
              provider,
            ),
          ),
      },
      privacyErasers: {
        register: (key, eraser) =>
          scope.track(() =>
            this.services.privacyErasers!.register(id, key, eraser),
          ),
      },
      taxonomies: {
        register: (key, definition) =>
          scope.track(() =>
            this.services.taxonomies!.register(id, key, definition),
          ),
      },
      fields: {
        register: (key, definition) =>
          scope.track(() =>
            this.services.fields!.register(id, key, definition),
          ),
      },
      contentTypes: {
        register: (key, definition) =>
          scope.track(() =>
            this.services.contentTypes!.register(id, key, definition),
          ),
      },
      capabilities: {
        register: (definition) =>
          scope.track(() =>
            this.services.capabilities!.register(definition, id),
          ),
      },
      pluginId: id,
      healthChecks: {
        register: (key, check) =>
          scope.track(() =>
            (this.services.healthChecks ??= new HealthChecks()).plugin(
              id,
              key,
              check,
            ),
          ),
      },
      jobs: (() => {
        const registrar = this.services.jobs?.registrar(id);
        return {
          register: (kind, definition) =>
            scope.track(() => {
              if (!registrar) throw new Error(Errors.PluginInactive);
              return registrar.register(kind, definition);
            }),
          enqueue: (kind, payload, options) =>
            scope.run(() => {
              if (!registrar) throw new Error(Errors.PluginInactive);
              return registrar.enqueue(kind, payload, options);
            }),
        } satisfies JobRegistrar;
      })(),
      mailTransports: {
        register: (key, transport) =>
          scope.track(() => {
            if (!this.services.mailTransports)
              throw new Error(Errors.EmailDisabled);
            return this.services.mailTransports.plugin(id, key, transport);
          }),
      },
      menuItemTypes: {
        register: (key, provider) =>
          scope.track(() =>
            this.services.menuItemTypes!.register(id, key, provider),
          ),
      },
      themeContributions: {
        register: (key, provider) =>
          scope.track(() =>
            this.services.themeContributions!.register(id, key, provider),
          ),
      },
      patterns: {
        register: (key, definitions) =>
          scope.track(() => {
            const snapshot = structuredClone(
              patternContributionSchema.parse(definitions),
            );
            for (const pattern of snapshot) {
              blocks.check(pattern.document);
              if (!this.services.patternRenderer)
                throw new Error(Errors.PluginInactive);
              this.services.patternRenderer.render(pattern.document);
            }
            return this.services.patterns!.register(id, key, () =>
              structuredClone(snapshot),
            );
          }),
      },
      imageSizes: {
        register: (size) =>
          scope.track(() =>
            (this.services.imageSizes ??= new ImageSizes()).register(size),
          ),
      },
      sitemaps: {
        register: (key, provider) =>
          scope.track(() =>
            this.services.sitemaps!.register(id, key, provider),
          ),
      },
      searchEngines: {
        register: (key, provider) =>
          scope.track(() =>
            this.services.searchEngines!.register(id, key, provider),
          ),
      },
      mediaProcessors: {
        register: (processor) =>
          scope.track(() =>
            (this.services.mediaProcessors ??= new MediaProcessors()).register(
              processor,
            ),
          ),
      },
      commentCheckers: {
        register: (checker) =>
          scope.track(() =>
            (this.services.commentCheckers ??= new CommentCheckers()).register(
              checker,
            ),
          ),
      },
      auth: {
        signInMethod: (key, method) =>
          scope.track(() => auth.signInMethod(key, method)),
        secondFactor: (key, factor) =>
          scope.track(() => auth.secondFactor(key, factor)),
        users: Object.freeze<UserDirectory>({
          findById: (userId) => scope.run(() => auth.users.findById(userId)),
          findByEmail: (email) =>
            scope.run(() => auth.users.findByEmail(email)),
        }),
      },
      hooks: {
        on: <K extends ActionName>(name: K, handler: ActionHandler<K>) =>
          scope.track(() => hookRegistrar.on(name, handler)),
        filter: <K extends FilterName>(
          name: K,
          handler: FilterHandler<K>,
          priority?: number,
        ) => scope.track(() => hookRegistrar.filter(name, handler, priority)),
      },
      slots: {
        provide: (slot, renderer) =>
          scope.track(() => slotRegistrar.provide(slot, renderer)),
      },
      widgets: {
        provide: (key, widget) =>
          scope.track(() => widgetRegistrar.provide(key, widget)),
      },
      embeds: {
        register: (provider) =>
          scope.track(() => embedRegistrar.register(provider)),
      },
      blocks: {
        register: (key, block) =>
          scope.track(() => blockRegistrar.register(key, block)),
      },
      tasks: {
        every: (name, intervalMs, task) => {
          if (!TASK_NAME.test(name) || name.length > 64)
            throw new Error(Errors.PluginTaskNameInvalid(name));
          return scope.track(() =>
            scheduler.add({
              name: `plugin:${id}:${name}`,
              intervalMs: Math.max(MIN_TASK_INTERVAL_MS, intervalMs),
              run: async () => {
                const result = await isolate(
                  () => scope.run(task),
                  TASK_TIMEOUT_MS,
                );
                if (!result.ok)
                  log.warn(`task "${name}" failed: ${result.error.message}`);
              },
            }),
          );
        },
      },
      admin: {
        page: (key, page) => scope.track(() => pageRegistrar.page(key, page)),
        dashboardWidget: (key, widget) =>
          scope.track(() => widgetBoxes.dashboardWidget(key, widget)),
      },
      routes: { add: (route) => scope.track(() => routeRegistrar.add(route)) },
      settings: {
        get: (key) => scope.run(() => settings.value(manifest, key)),
        all: () => scope.run(() => settings.values(manifest)),
      },
      storage: {
        get: async <T>(key: string) =>
          (await scope.run(() => data.get(id, 'kv', checkKey(key)))) as
            T | undefined,
        set: (key, value) =>
          scope.run(() => data.set(id, 'kv', checkKey(key), value)),
        delete: (key) => scope.run(() => data.delete(id, 'kv', checkKey(key))),
        keys: () =>
          scope.run(async () => Object.keys(await data.entries(id, 'kv'))),
      },
      // Do not expose the concrete reader: it also implements private reads and unlock callbacks.
      content: Object.freeze<ContentReader>({
        list: (query) => scope.run(() => content.list(query)),
        getBySlug: (slug) => scope.run(() => content.getBySlug(slug)),
      }),
      logger: log,
    } satisfies PluginContext);
  }
}
