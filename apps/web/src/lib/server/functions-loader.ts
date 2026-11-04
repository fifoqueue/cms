import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';
import { Errors } from '#lib/errors.js';
import { pathToFileURL } from 'node:url';
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

const compile = promisify(execFile);
const require = createRequire(import.meta.url);
const compiler = `
import { build } from 'bun';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

const [input, output, sdk] = process.argv.slice(-3);
const require = createRequire(sdk);
const result = await build({
  entrypoints: [input], target: 'node', format: 'esm',
  plugins: [{
    name: 'web-functions-sdk',
    setup(builder) {
      builder.onResolve({ filter: new RegExp('^@cms/sdk(?:/|$)') }, ({ path }) => ({
        path: require.resolve(path),
      }));
    },
  }],
});

if (!result.success) {
  console.error(...result.logs);
  process.exit(1);
}

await writeFile(output, await result.outputs[0].text(), { flag: 'wx', mode: 0o600 });
`;

/** Generated snapshots execute through the native module loader. */
const importModule = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ functions: unknown }>;

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
  compilerExecutable?: string;
  compilerTimeoutMs?: number;
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
  private controller = new AbortController();

  constructor(private readonly options: LoaderOptions) {}

  private async executable() {
    if (this.options.compilerExecutable)
      return resolve(this.options.compilerExecutable);
    if (process.versions.bun) return process.execPath;

    if (process.env.BUN_EXECUTABLE) {
      const executable = resolve(process.env.BUN_EXECUTABLE);

      await access(executable, constants.X_OK);

      return executable;
    }

    for (const directory of (process.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)) {
      const executable = resolve(
        directory,
        process.platform === 'win32' ? 'bun.exe' : 'bun',
      );

      try {
        await access(executable, constants.X_OK);

        return executable;
      } catch (error) {
        if (
          !['ENOENT', 'EACCES', 'ENOTDIR'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        )
          throw error;
      }
    }

    this.options.logger.error(
      'Compiler executable unavailable; set BUN_EXECUTABLE to an absolute executable path',
    );
    throw new Error(Errors.PluginActivationFailed);
  }

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
    const executable = await this.executable();

    this.controller.signal.throwIfAborted();
    const compilation = compile(
      executable,
      [
        '--eval',
        compiler,
        input,
        output,
        require.resolve('@cms/sdk/functions'),
      ],
      {
        windowsHide: true,
        timeout: Math.max(
          1,
          Math.min(this.options.compilerTimeoutMs ?? 15000, 15000),
        ),
        killSignal: 'SIGKILL',
        signal: this.controller.signal,
      },
    );
    const closed = new Promise<void>((resolve) =>
      compilation.child.once('close', () => resolve()),
    );

    try {
      await compilation;
    } finally {
      await closed;
    }

    this.controller.signal.throwIfAborted();
    const module = await importModule(pathToFileURL(output).href);

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
    if (!this.pending && this.controller.signal.aborted)
      this.controller = new AbortController();

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
      signal: AbortSignal.any([
        AbortSignal.timeout(5000),
        this.controller.signal,
      ]),
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

    this.controller.signal.throwIfAborted();
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
    this.controller.abort();
    await this.pending;

    for (const scope of this.active.values()) scope.dispose();
    this.active.clear();
    this.etag = undefined;
    this.current.clear();
    this.previous.clear();
    await this.prune();
  }
}
