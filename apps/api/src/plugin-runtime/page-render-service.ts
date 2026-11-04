import {
  pageRenderQuerySchema,
  renderPageSchema,
  templateCandidatesSchema,
  bodyClassesSchema,
  acceptsResponseHeaders,
  SLOT_NAMES,
} from '@cms/sdk';
import type { PageRender } from '@cms/sdk';
import type { HookDispatcher } from '#api/domain/ports';
import type { AssetRegistry } from '#api/plugin-runtime/asset-registry';
import type { ThemeService } from '#api/domain/theme/theme-service';
import type { SlotService } from '#api/plugin-runtime/slot-service';
import { parseInput } from '#api/shared/validation';

export class PageRenderService {
  private readonly requests = new WeakMap<
    object,
    Map<string, Promise<PageRender>>
  >();

  constructor(
    private readonly slots: Pick<SlotService, 'render'>,
    private readonly hooks?: HookDispatcher,
    private readonly themes?: Pick<ThemeService, 'getPublic'>,
    private readonly assets?: AssetRegistry,
  ) {}

  render(input: unknown, request?: object): Promise<PageRender> {
    const query = parseInput(pageRenderQuerySchema, input);

    if (!request) return this.compose(query);
    let cache = this.requests.get(request);

    if (!cache) {
      cache = new Map();
      this.requests.set(request, cache);
    }

    const key = JSON.stringify(query);
    let result = cache.get(key);

    if (!result) {
      result = this.compose(query);
      cache.set(key, result);
    }

    return result;
  }

  private async compose(
    query: ReturnType<typeof pageRenderQuerySchema.parse>,
  ): Promise<PageRender> {
    const fragments = await this.slots.render(query);
    let bodyClasses: string[] = [];
    let templateCandidates: string[] = [];
    let headers: Record<string, string> = {};

    if (this.hooks?.has('response.headers')) {
      const page = renderPageSchema.parse(query);
      const identity = JSON.stringify(page);
      const status = query.status ?? 200;
      const result = await this.hooks.applyFilter(
        'response.headers',
        { page, status, headers: { ...headers } },
        (value) => {
          if (!value || typeof value !== 'object') return false;
          const candidate = value as {
            page?: unknown;
            status?: unknown;
            headers?: unknown;
          };
          const parsed = renderPageSchema.safeParse(candidate.page);

          return (
            parsed.success &&
            JSON.stringify(parsed.data) === identity &&
            candidate.status === status &&
            acceptsResponseHeaders(candidate.headers, headers)
          );
        },
        (_owner, _previous, next) => {
          headers = { ...next.headers };
        },
      );

      headers = result.headers;
    }

    if (this.hooks?.has('page.bodyClasses')) {
      const page = renderPageSchema.parse(query);
      const identity = JSON.stringify(page);
      const result = await this.hooks.applyFilter(
        'page.bodyClasses',
        { page, classes: [] },
        (value) => {
          const parsed = bodyClassesSchema.safeParse(value);

          return (
            parsed.success && JSON.stringify(parsed.data.page) === identity
          );
        },
      );

      bodyClasses = result.classes;
    }

    if (this.hooks?.has('template.candidates') && this.themes) {
      const page = renderPageSchema.parse(query);
      const identity = JSON.stringify(page);
      const templates = new Set(
        Object.keys((await this.themes.getPublic()).templates),
      );
      const result = await this.hooks.applyFilter(
        'template.candidates',
        { page, candidates: [] },
        (value) => {
          const parsed = templateCandidatesSchema.safeParse(value);

          return (
            parsed.success &&
            JSON.stringify(parsed.data.page) === identity &&
            parsed.data.candidates.every((name) => templates.has(name))
          );
        },
      );

      templateCandidates = result.candidates;
    }

    return {
      slots: Object.fromEntries(
        SLOT_NAMES.map((name) => [name, fragments[name].join('')]),
      ) as PageRender['slots'],
      bodyClasses,
      assets:
        this.assets && !this.assets.empty
          ? await this.assets.resolve(renderPageSchema.parse(query))
          : [],
      headers,
      templateCandidates,
    };
  }
}
