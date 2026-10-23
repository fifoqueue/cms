import {
  adminPatternSchema,
  can,
  contentDocumentSchema,
  patternInputSchema,
} from '@cms/sdk';
import type { AdminPattern } from '@cms/sdk';
import { z } from 'zod';
import type { Actor } from '#api/domain/auth/authorization';
import { authorize } from '#api/domain/auth/authorization';
import type { DocumentRenderer } from '#api/domain/content/content-repository';
import type { Clock, IdGenerator } from '#api/domain/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import { Errors, forbidden, invalidInput, notFound } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

const PREFIX = 'pattern.';
const LIMIT = 500;
/** References one served body may expand, and how deeply patterns may nest. */
const EXPANSIONS = 50;
const DEPTH = 4;
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
      settings: SettingsRepository;
      renderer: DocumentRenderer;
      ids: IdGenerator;
      clock: Clock;
    },
  ) {}

  async list(actor: Actor): Promise<AdminPattern[]> {
    authorize(actor, 'content.create');
    return (await this.all())
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(toAdmin);
  }

  async get(id: string, actor: Actor): Promise<AdminPattern> {
    authorize(actor, 'content.create');
    return toAdmin(await this.require(id));
  }

  async create(input: unknown, actor: Actor): Promise<AdminPattern> {
    authorize(actor, 'content.create');
    const data = this.prepare(input, actor);
    if ((await this.all()).length >= LIMIT)
      throw invalidInput(Errors.PatternLimit);
    const now = this.deps.clock.now().toISOString();
    const pattern: StoredPattern = {
      id: this.deps.ids.next(),
      ...data,
      authorId: actor.id,
      updatedAt: now,
    };
    await this.deps.settings.set(`${PREFIX}${pattern.id}`, pattern);
    return toAdmin(pattern);
  }

  async update(
    id: string,
    input: unknown,
    actor: Actor,
  ): Promise<AdminPattern> {
    const current = await this.editable(id, actor);
    const pattern: StoredPattern = {
      ...current,
      ...this.prepare(input, actor),
      updatedAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.settings.set(`${PREFIX}${id}`, pattern);
    return toAdmin(pattern);
  }

  /** Entries that still reference it show nothing in its place. */
  async remove(id: string, actor: Actor): Promise<void> {
    await this.editable(id, actor);
    await this.deps.settings.set(`${PREFIX}${id}`, null);
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
    const bodies = new Map<string, string | null>();
    let budget = EXPANSIONS;
    const body = async (id: string) => {
      if (!bodies.has(id)) {
        const pattern = budget-- > 0 ? await this.find(id) : null;
        bodies.set(id, pattern?.status === 'published' ? pattern.html : null);
      }
      return bodies.get(id) ?? null;
    };
    const walk = async (text: string, chain: string[]): Promise<string> => {
      const ids = [
        ...new Set([...text.matchAll(REFERENCE)].map((match) => match[1]!)),
      ];
      if (!ids.length) return text;
      const parts = new Map<string, string>();
      for (const id of ids) {
        const inner =
          chain.includes(id) || chain.length >= DEPTH ? null : await body(id);
        parts.set(id, inner === null ? '' : await walk(inner, [...chain, id]));
      }
      return text.replace(REFERENCE, (_, id: string) => parts.get(id) ?? '');
    };
    return walk(html, []);
  }

  /** Validated input; publishing a pattern needs `content.publish`. */
  private prepare(input: unknown, actor: Actor) {
    const data = parseInput(patternInputSchema, input);
    if (data.status === 'published' && !can(actor, 'content.publish'))
      throw forbidden();
    // Rejects documents outside the editor schema, like a content save.
    return { ...data, html: this.deps.renderer.render(data.document) };
  }

  /** The author edits their own patterns; other users' need `content.editOthers`. */
  private async editable(id: string, actor: Actor) {
    const pattern = await this.require(id);
    authorize(
      actor,
      pattern.authorId === actor.id ? 'content.create' : 'content.editOthers',
    );
    return pattern;
  }

  private async require(id: string) {
    const pattern = await this.find(id);
    if (!pattern) throw notFound(Errors.PatternNotFound);
    return pattern;
  }

  private async find(id: string): Promise<StoredPattern | null> {
    if (!/^[A-Za-z0-9-]{1,36}$/.test(id)) return null;
    const parsed = storedSchema.safeParse(
      await this.deps.settings.get(`${PREFIX}${id}`),
    );
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
