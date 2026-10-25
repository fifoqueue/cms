import {
  adminPatternSchema,
  can,
  contentDocumentSchema,
  patternInputSchema,
  patternListQuerySchema,
} from '@cms/sdk';
import type {
  AdminPattern,
  ContentDocument,
  Paginated,
  PatternSummary,
} from '@cms/sdk';
import type { PatternCatalog } from '#api/domain/content/pattern-catalog';
import type { PatternContributions } from '@cms/sdk/plugin';
import { z } from 'zod';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { DocumentRenderer } from '#api/domain/content/content-repository';
import type { Clock, IdGenerator, HookDispatcher } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { SettingsTransactions } from '#api/domain/site/settings-transactions';
import { Errors, forbidden, invalidInput, notFound } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const PREFIX = 'pattern.';
const LOCK = 'patterns.lock';
const LIMIT = 500;
/** References one served body may expand, and how deeply patterns may nest. */
const EXPANSIONS = 50;
const DEPTH = 4;
const OUTPUT_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
/** `PatternRef` markup as `@cms/content` renders it; the id is captured. */
const REFERENCE =
  /<div class="cms-pattern" data-cms-pattern="([A-Za-z0-9-]{1,36})"><\/div>/g;

/** What is stored per pattern (`pattern.<id>` setting); `null` marks a deleted one. */
const storedSchema = adminPatternSchema.extend({
  document: contentDocumentSchema,
  html: z.string(),
});
type StoredPattern = z.output<typeof storedSchema>;

const toAdmin = ({
  id,
  title,
  document,
  synced,
  status,
  authorId,
  updatedAt,
}: StoredPattern): AdminPattern => ({
  id,
  title,
  document,
  synced,
  status,
  authorId,
  updatedAt,
});

/**
 * Patterns (WordPress reusable blocks): content saved once and inserted into entries, by
 * reference when synced. Served bodies get the current published pattern in place of each
 * reference, so editing a synced pattern updates every entry at once.
 */
export class PatternService {
  constructor(
    private readonly deps: {
      settings: Pick<SettingsRepository, 'get' | 'list'>;
      transactions: SettingsTransactions;
      catalog: PatternCatalog;
      renderer: DocumentRenderer;
      ids: IdGenerator;
      clock: Clock;
      hooks?: HookDispatcher;
      contributions?: {
        keys(): string[];
        resolveEntry(
          query: null,
          key: string,
        ): Promise<{ source: string; value: PatternContributions } | null>;
      };
      /** Checks the attributes of active plugins' blocks, like a content save. */
      blocks?: { check(document: ContentDocument): void };
    },
  ) {}

  /** Non-persistent plugin patterns: inserting one copies its validated editor document. */
  async contributions(actor: Actor) {
    authorize(actor, 'content.create');
    const result: {
      key: string;
      source: string;
      patterns: PatternContributions;
    }[] = [];
    for (const key of this.deps.contributions?.keys() ?? []) {
      const entry = await this.deps.contributions!.resolveEntry(null, key);
      if (entry)
        result.push({ key, source: entry.source, patterns: entry.value });
    }
    return result;
  }

  async list(query: unknown, actor: Actor): Promise<Paginated<PatternSummary>> {
    authorize(actor, 'content.create');
    const criteria = parseInput(patternListQuerySchema, query);
    const result = await this.deps.catalog.summaries({
      ...criteria,
      ...(!can(actor, 'content.editOthers') && { authorId: actor.id }),
    });
    return { ...result, page: criteria.page, pageSize: criteria.pageSize };
  }

  async get(id: string, actor: Actor): Promise<AdminPattern> {
    authorize(actor, 'content.create');
    const pattern = await this.require(id);
    if (
      pattern.status !== 'published' &&
      pattern.authorId !== actor.id &&
      !can(actor, 'content.editOthers')
    )
      throw notFound(Errors.PatternNotFound);
    return toAdmin(pattern);
  }

  async create(input: unknown, actor: Actor): Promise<AdminPattern> {
    authorize(actor, 'content.create');
    const data = await this.prepare(input, actor);
    const now = this.deps.clock.now().toISOString();
    const pattern: StoredPattern = {
      id: this.deps.ids.next(),
      ...data,
      authorId: actor.id,
      updatedAt: now,
    };
    const dto = await this.deps.transactions.run(LOCK, async (settings) => {
      if ((await settings.count(PREFIX)) >= LIMIT)
        throw invalidInput(Errors.PatternLimit);
      await settings.set(`${PREFIX}${pattern.id}`, pattern);
      return toAdmin(pattern);
    });
    void this.deps.hooks?.emit('pattern.created', dto);
    return dto;
  }

  async update(
    id: string,
    input: unknown,
    actor: Actor,
  ): Promise<AdminPattern> {
    authorize(actor, 'content.create');
    const data = await this.prepare(input, actor);
    const dto = await this.deps.transactions.run(LOCK, async (settings) => {
      const current = await this.editable(id, actor, settings);
      const pattern: StoredPattern = {
        ...current,
        ...data,
        updatedAt: this.deps.clock.now().toISOString(),
      };
      await settings.set(`${PREFIX}${id}`, pattern);
      return toAdmin(pattern);
    });
    void this.deps.hooks?.emit('pattern.updated', dto);
    return dto;
  }

  /** Entries that still reference it show nothing in its place. */
  async remove(id: string, actor: Actor): Promise<void> {
    authorize(actor, 'content.create');
    const dto = await this.deps.transactions.run(LOCK, async (settings) => {
      const current = await this.editable(id, actor, settings);
      await settings.set(`${PREFIX}${id}`, null);
      return toAdmin(current);
    });
    void this.deps.hooks?.emit('pattern.deleted', dto);
  }

  /** Published patterns for the WXR export, oldest first. */
  async exportable(): Promise<StoredPattern[]> {
    return (await this.all()).sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt),
    );
  }

  /**
   * Served HTML with each reference replaced by its published pattern (expanded the same way).
   * Drafts, deleted patterns, cycles and nesting beyond the limit leave nothing behind.
   */
  async expand(html: string): Promise<string> {
    if (!html.includes('data-cms-pattern=')) return html;
    const bodies = new Map<string, string | null>();
    const chunks: string[] = [];
    let references = EXPANSIONS;
    let bytes = OUTPUT_BYTES;
    let exhausted = false;
    const append = (text: string) => {
      if (exhausted) return;
      // Reject before allocating an encoding larger than the remaining byte budget.
      const size =
        text.length <= bytes ? encoder.encode(text).byteLength : bytes + 1;
      if (size > bytes) {
        exhausted = true;
        return;
      }
      bytes -= size;
      chunks.push(text);
    };
    const walk = async (text: string, chain: string[]): Promise<void> => {
      let start = 0;
      for (const match of text.matchAll(REFERENCE)) {
        append(text.slice(start, match.index));
        if (exhausted) return;
        start = match.index + match[0].length;
        const id = match[1]!;
        // Every occurrence consumes work, including cached references and cycles.
        if (references-- <= 0 || chain.includes(id) || chain.length >= DEPTH)
          continue;
        if (!bodies.has(id)) {
          const pattern = await this.find(id);
          bodies.set(id, pattern?.status === 'published' ? pattern.html : null);
        }
        const inner = bodies.get(id);
        if (inner) await walk(inner, [...chain, id]);
        if (exhausted) return;
      }
      append(text.slice(start));
    };
    await walk(html, []);
    // Never serve truncated markup (it could leave a container or attribute open).
    return exhausted ? '' : chunks.join('');
  }

  /** Validated input; publishing a pattern needs `content.publish`. */
  private async prepare(input: unknown, actor: Actor) {
    const initial = parseInput(patternInputSchema, input);
    const filtered = await this.deps.hooks?.applyFilter(
      'pattern.beforeSave',
      initial,
      (value) => patternInputSchema.safeParse(value).success,
    );
    const data = patternInputSchema.parse(filtered ?? initial);
    if (data.status === 'published' && !can(actor, 'content.publish'))
      throw forbidden();
    this.deps.blocks?.check(data.document);
    // Rejects documents outside the editor schema, like a content save.
    return { ...data, html: this.deps.renderer.render(data.document) };
  }

  /** The author edits their own patterns; other users' need `content.editOthers`. */
  private async editable(
    id: string,
    actor: Actor,
    settings: Pick<SettingsRepository, 'get'>,
  ) {
    const pattern = await this.require(id, settings);
    authorize(actor, 'content.create');
    if (pattern.authorId !== actor.id) authorize(actor, 'content.editOthers');
    else if (pattern.status === 'published')
      authorize(actor, 'content.publish');
    return pattern;
  }

  private async require(
    id: string,
    settings: Pick<SettingsRepository, 'get'> = this.deps.settings,
  ) {
    const pattern = await this.find(id, settings);
    if (!pattern) throw notFound(Errors.PatternNotFound);
    return pattern;
  }

  private async find(
    id: string,
    settings: Pick<SettingsRepository, 'get'> = this.deps.settings,
  ): Promise<StoredPattern | null> {
    if (!/^[A-Za-z0-9-]{1,36}$/.test(id)) return null;
    const parsed = storedSchema.safeParse(await settings.get(`${PREFIX}${id}`));
    return parsed.success ? parsed.data : null;
  }

  private async all(): Promise<StoredPattern[]> {
    return Object.values(await this.deps.settings.list(PREFIX)).flatMap(
      (value) => {
        const parsed = storedSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      },
    );
  }
}
