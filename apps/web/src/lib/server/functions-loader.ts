import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  webFunctionsDefinitionSchema,
  webFunctionsDeliverySchema,
  webFunctionsSourceSchema,
} from '@cms/sdk/functions';
import type { WebFunctionsSource } from '@cms/sdk/functions';
import { SSO_FRONTEND_SECRET_HEADER } from '@cms/sdk';
import type {
  FunctionsDefinition,
  WebFunctionsContext,
} from '@cms/sdk/functions';

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

interface ModuleBuilder {
  build(options: {
    entrypoints: string[];
    target: 'bun';
    format: 'esm';
    plugins: {
      name: string;
      setup(builder: {
        onResolve(
          options: { filter: RegExp },
          resolve: (input: { path: string }) => { path: string },
        ): void;
      }): void;
    }[];
  }): Promise<{
    success: boolean;
    logs: unknown[];
    outputs: { text(): Promise<string> }[];
  }>;
}

const sourceSchema = webFunctionsSourceSchema.refine(
  (source) => hash(source.code) === source.hash,
);

export interface WebFunctionsScope {
  context: WebFunctionsContext;
  commit(): void;
  dispose(): void;
}

type LoaderOptions = {
  url: string;
  directory: string;
  secret(): string;
  scope(owner: string): WebFunctionsScope;
  fetch?: typeof fetch;
  logger: WebFunctionsContext['logger'];
};

/** A new scope remains invisible until activation succeeds. */
export class WebFunctionsLoader {
  private etag: string | undefined;
  private pending: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly active = new Map<string, WebFunctionsScope>();
  private readonly modules = new Map<string, Promise<FunctionsDefinition>>();
  private readonly files = new Map<string, string>();
  private current = new Set<string>();
  private previous = new Set<string>();

  constructor(private readonly options: LoaderOptions) {}

  private module(source: WebFunctionsSource) {
    let pending = this.modules.get(source.hash);

    if (!pending) {
      pending = this.importSource(source).catch(async (error: unknown) => {
        this.modules.delete(source.hash);
        await this.release(source.hash);

        throw error;
      });
      this.modules.set(source.hash, pending);
    }

    return pending;
  }

  private async importSource(source: WebFunctionsSource) {
    await mkdir(this.options.directory, { recursive: true });
    const directory = await mkdtemp(
      join(this.options.directory, `${source.hash}-`),
    );
    const input = join(directory, 'source.ts');
    const output = join(directory, 'module.mjs');

    this.files.set(source.hash, directory);
    await writeFile(input, source.code, { flag: 'wx', mode: 0o600 });
    const runtime = globalThis as typeof globalThis & { Bun: ModuleBuilder };
    const result = await runtime.Bun.build({
      entrypoints: [input],
      target: 'bun',
      format: 'esm',
      plugins: [
        {
          name: 'web-functions-sdk',
          setup(build) {
            build.onResolve({ filter: /^@cms\/sdk(?:\/|$)/ }, ({ path }) => ({
              path: fileURLToPath(import.meta.resolve(path)),
            }));
          },
        },
      ],
    });

    if (!result.success) throw result.logs[0];
    await writeFile(output, await result.outputs[0]!.text(), {
      flag: 'wx',
      mode: 0o600,
    });
    const module = await import(/* @vite-ignore */ pathToFileURL(output).href);

    return webFunctionsDefinitionSchema.parse(module.functions);
  }

  /** Only this loader's uniquely allocated snapshots are eligible for removal. */
  private async release(hash: string) {
    const directory = this.files.get(hash);

    if (!directory) return;
    await rm(directory, { recursive: true, force: true });
    this.files.delete(hash);
  }

  private async prune() {
    for (const [hash, pending] of this.modules) {
      if (this.current.has(hash) || this.previous.has(hash)) continue;

      await pending.catch(() => undefined);
      await this.release(hash);
      this.modules.delete(hash);
    }
  }

  refresh(): Promise<void> {
    return (this.pending ??= this.update()
      .catch((error: unknown) => {
        this.options.logger.error('Web functions refresh failed', error);
      })
      .finally(() => {
        this.pending = undefined;
      }));
  }

  private async update() {
    const secret = this.options.secret();

    if (!secret) return;
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      headers: {
        [SSO_FRONTEND_SECRET_HEADER]: secret,
        ...(this.etag ? { 'if-none-match': this.etag } : {}),
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    });

    if (response.status === 304) return;

    if (!response.ok) {
      this.options.logger.warn(
        'Web functions delivery failed',
        response.status,
      );

      return;
    }

    const payload = webFunctionsDeliverySchema.parse(await response.json());

    payload.sources.forEach((source) => sourceSchema.parse(source));
    const staged = new Map<string, WebFunctionsScope>();

    try {
      for (const source of payload.sources) {
        const definition = await this.module(source);
        const scope = this.options.scope(source.owner);

        staged.set(source.owner, scope);
        await definition.web?.(scope.context);
      }
    } catch (error) {
      for (const scope of staged.values()) scope.dispose();
      await this.prune();

      throw error;
    }

    for (const scope of this.active.values()) scope.dispose();
    this.active.clear();

    for (const [owner, scope] of staged) {
      scope.commit();
      this.active.set(owner, scope);
    }

    this.etag = `"${payload.version}"`;
    this.previous = this.current;
    this.current = new Set(payload.sources.map((source) => source.hash));
    await this.prune();
  }

  start() {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 10_000);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.pending;

    for (const scope of this.active.values()) scope.dispose();
    this.active.clear();
    this.etag = undefined;
    this.current.clear();
    this.previous.clear();
    await this.prune();
  }
}
