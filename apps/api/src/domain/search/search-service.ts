import {
  adminSearchSettingsSchema,
  searchSettingsInputSchema,
  searchSettingsSchema,
} from '@cms/sdk';
import type {
  AdminSearchSettings,
  SearchSettings,
  SearchStatus,
} from '@cms/sdk';
import type { Clock, SecretBox } from '#api/domain/ports';
import type {
  SearchConnection,
  SearchDocument,
  SearchEngine,
  SearchQuery,
  SearchSource,
} from '#api/domain/search/ports';
import type { SettingsRepository } from '#api/domain/site/site-service';
import type { Logger } from '#api/shared/logger';
import {
  DomainError,
  invalidInput,
  messageOf,
  Errors,
} from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';
import type { HookDispatcher } from '#api/domain/ports';
import { searchHookDocumentSchema } from '@cms/sdk/plugin';

const KEY = 'search';
const STATE_KEY = 'search.state';
/** After a failure, the index is left alone (and the database answers) this long. */
const RETRY_MS = 30_000;
const BATCH = 500;

interface Stored {
  settings: SearchSettings;
  /** Sealed API key; empty when none. */
  apiKey: string;
}

/** Shared by every API instance through the settings table. */
interface IndexState {
  /** The index holds every public entry for `fingerprint` (as of the outbox). */
  ready: boolean;
  /** Host and index the ready index belongs to; other values need a rebuild. */
  fingerprint: string;
  failedAt: string | null;
  lastError: string | null;
  syncedAt: string | null;
}

const EMPTY_STATE: IndexState = {
  ready: false,
  fingerprint: '',
  failedAt: null,
  lastError: null,
  syncedAt: null,
};

type Connection = SearchConnection & { fingerprint: string };

/**
 * Meilisearch as an accelerator for public search. MariaDB stays the source of truth: the
 * index is used only while it holds every committed change (empty outbox) and has not failed
 * recently; otherwise `find` answers `null` and callers search the database.
 */
export class SearchService {
  constructor(
    private readonly deps: {
      settings: SettingsRepository;
      hooks?: HookDispatcher;
      secrets: SecretBox;
      engine: SearchEngine;
      source: SearchSource;
      clock: Clock;
      logger: Logger;
      checkDestination?: (url: string) => Promise<void>;
    },
  ) {}

  async getAdmin(): Promise<AdminSearchSettings> {
    const { settings, apiKey } = await this.stored();
    return adminSearchSettingsSchema.parse({
      ...settings,
      apiKeyConfigured: !!apiKey,
    });
  }

  async update(input: unknown): Promise<AdminSearchSettings> {
    const { apiKey, ...settings } = parseInput(
      searchSettingsInputSchema,
      input,
    );
    const current = await this.stored();
    if (settings.enabled) await this.deps.checkDestination?.(settings.host);
    await this.deps.settings.set(KEY, {
      settings,
      apiKey:
        apiKey === undefined
          ? current.apiKey
          : apiKey
            ? this.deps.secrets.seal(apiKey)
            : '',
    } satisfies Stored);
    // A changed connection is retried at once rather than after the failure pause.
    await this.saveState({ failedAt: null, lastError: null });
    return this.getAdmin();
  }

  /** Checks the saved connection; `invalid_input` explains a failure. */
  async test(): Promise<{ version: string }> {
    const connection = await this.connection(true);
    if (!connection) throw invalidInput(Errors.SearchNotConfigured);
    try {
      return { version: await this.deps.engine.version(connection) };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw invalidInput(Errors.SearchUnavailable(messageOf(error)));
    }
  }

  /** Rebuilds the index from the database on the next sync. */
  reindex() {
    return this.deps.source.requestRebuild();
  }

  async status(): Promise<SearchStatus> {
    const [connection, state, pending] = await Promise.all([
      this.connection(),
      this.state(),
      this.deps.source.countPending(),
    ]);
    const documents = connection
      ? await this.deps.engine.count(connection).catch(() => null)
      : null;
    const current =
      !!connection &&
      state.ready &&
      state.fingerprint === connection.fingerprint;
    return {
      engine:
        current && !this.failing(state) && pending === 0
          ? 'meilisearch'
          : 'database',
      state: !connection
        ? 'disabled'
        : this.failing(state)
          ? 'failing'
          : !current
            ? 'building'
            : pending > 0
              ? 'syncing'
              : 'ready',
      pending,
      documents,
      lastError: state.lastError,
      lastSyncAt: state.syncedAt,
    };
  }

  /**
   * Ids and total of a public search from the index, or `null` when the database must answer:
   * search off, index incomplete or behind, recent failure, or the engine failing now.
   */
  async find(
    query: SearchQuery,
  ): Promise<{ ids: string[]; total: number } | null> {
    const connection = await this.connection();
    if (!connection) return null;
    const state = await this.state();
    if (
      !state.ready ||
      state.fingerprint !== connection.fingerprint ||
      this.failing(state) ||
      (await this.deps.source.countPending()) > 0
    )
      return null;
    try {
      return await this.deps.engine.search(connection, query);
    } catch (error) {
      await this.fail(error);
      return null;
    }
  }

  /** Applies queued changes (or rebuilds) so the index catches up; run by one instance at a time. */
  async sync(): Promise<void> {
    const connection = await this.connection();
    const state = await this.state();
    if (!connection) {
      // Changes made while search is off are covered by the rebuild that turning it on starts.
      const last = await this.deps.source.lastId();
      if (last) await this.deps.source.acknowledge(last);
      if (state.ready) await this.saveState({ ready: false });
      return;
    }
    if (this.failing(state)) return;
    try {
      let rebuild =
        !state.ready || state.fingerprint !== connection.fingerprint;
      for (;;) {
        if (rebuild) {
          await this.saveState({ ready: false });
          const upTo = await this.deps.source.lastId();
          await this.deps.engine.rebuild(connection, this.everyDocument());
          await this.deps.source.acknowledge(upTo);
          await this.saveState({
            ready: true,
            fingerprint: connection.fingerprint,
            failedAt: null,
            lastError: null,
            syncedAt: this.deps.clock.now().toISOString(),
          });
          void this.deps.hooks?.emit('search.indexed', {
            operation: 'rebuild',
            contentIds: null,
          });
          rebuild = false;
          continue;
        }
        const batch = await this.deps.source.pending(BATCH);
        if (!batch.length) break;
        if (batch.some((entry) => entry.contentId === null)) {
          rebuild = true;
          continue;
        }
        const ids = [...new Set(batch.map((entry) => entry.contentId!))];
        const documents = await this.documents(
          await this.deps.source.documents(ids),
        );
        const present = new Set(documents.map((document) => document.id));
        if (documents.length)
          await this.deps.engine.upsert(connection, documents);
        const gone = ids.filter((id) => !present.has(id));
        if (gone.length) await this.deps.engine.remove(connection, gone);
        await this.deps.source.acknowledge(batch.at(-1)!.id);
        await this.saveState({ syncedAt: this.deps.clock.now().toISOString() });
        void this.deps.hooks?.emit('search.indexed', {
          operation: 'update',
          contentIds: ids,
        });
      }
      if (state.failedAt)
        await this.saveState({ failedAt: null, lastError: null });
    } catch (error) {
      await this.fail(error);
    }
  }

  private async *everyDocument(): AsyncIterable<SearchDocument[]> {
    let after: string | null = null;
    for (;;) {
      const page = await this.deps.source.page(after, BATCH);
      if (!page.length) return;
      yield await this.documents(page);
      after = page.at(-1)!.id;
    }
  }

  private failing(state: IndexState) {
    return (
      !!state.failedAt &&
      this.deps.clock.now().getTime() - Date.parse(state.failedAt) < RETRY_MS
    );
  }

  private async documents(documents: SearchDocument[]) {
    return Promise.all(
      documents.map(async (document) => {
        const filtered = await this.deps.hooks?.applyFilter(
          'search.document',
          document,
          (value) => {
            const result = searchHookDocumentSchema.safeParse(value);
            return result.success && result.data.id === document.id;
          },
        );
        return searchHookDocumentSchema.parse(filtered ?? document);
      }),
    );
  }

  private async fail(error: unknown) {
    this.deps.logger.warn(`Search index failed: ${messageOf(error)}`);
    await this.saveState({
      failedAt: this.deps.clock.now().toISOString(),
      lastError: messageOf(error).slice(0, 300),
    });
  }

  /** The connection while search is on and configured; `force` ignores the switch (connection checks). */
  private async connection(force = false): Promise<Connection | null> {
    const { settings, apiKey } = await this.stored();
    if ((!settings.enabled && !force) || !settings.host) return null;
    const host = settings.host.replace(/\/+$/, '');
    const index = `${settings.indexPrefix}_content`;
    return {
      host,
      apiKey: apiKey ? (this.deps.secrets.open(apiKey) ?? '') : '',
      index,
      fingerprint: `${host}|${index}`,
    };
  }

  private async stored(): Promise<Stored> {
    const raw = (await this.deps.settings.get(KEY)) as
      Partial<Stored> | undefined;
    const parsed = searchSettingsSchema.safeParse(raw?.settings);
    return {
      settings: parsed.success ? parsed.data : searchSettingsSchema.parse({}),
      apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : '',
    };
  }

  private async state(): Promise<IndexState> {
    const raw = (await this.deps.settings.get(STATE_KEY)) as
      Partial<IndexState> | undefined;
    return { ...EMPTY_STATE, ...raw };
  }

  /** Merges `changes` into the shared state. */
  private async saveState(changes: Partial<IndexState>) {
    await this.deps.settings.set(STATE_KEY, {
      ...(await this.state()),
      ...changes,
    });
  }
}
