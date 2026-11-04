import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FunctionsDefinition } from '@cms/sdk/functions';
import type { FunctionsSource } from '#api/functions-runtime/functions-host';
import { Errors, invalidInput } from '#api/shared/errors';

/** Each snapshot owns its files; no process ever prunes another import's files. */
export const versionedSource = (
  directory: string,
  owner: string,
  text: string,
): FunctionsSource => {
  const hash = createHash('sha256').update(text).digest('hex');
  const stem = join(directory, '.versions', `${hash}-${randomUUID()}`);
  const input = `${stem}.ts`;
  const output = `${stem}.mjs`;
  let pending: Promise<FunctionsDefinition> | undefined;
  const load = async (): Promise<FunctionsDefinition> => {
    await mkdir(join(directory, '.versions'), { recursive: true });
    try {
      await writeFile(input, text, { flag: 'wx', mode: 0o600 });
      const result = await Bun.build({
        entrypoints: [input],
        target: 'bun',
        format: 'esm',
        plugins: [
          {
            name: 'functions-sdk',
            setup(build) {
              build.onResolve({ filter: /^@cms\/sdk(?:\/|$)/ }, ({ path }) => ({
                path: fileURLToPath(import.meta.resolve(path)),
              }));
            },
          },
        ],
      });
      if (!result.success) throw invalidInput(Errors.PluginExportMissing);
      await writeFile(output, await result.outputs[0]!.text(), {
        flag: 'wx',
        mode: 0o600,
      });
      const module = (await import(pathToFileURL(output).href)) as {
        functions?: unknown;
      };
      const value = module.functions;
      if (typeof value !== 'object' || value === null)
        throw invalidInput(Errors.PluginExportMissing);
      const definition = value as FunctionsDefinition;
      if (
        (definition.api !== undefined &&
          typeof definition.api !== 'function') ||
        (definition.web !== undefined && typeof definition.web !== 'function')
      )
        throw invalidInput(Errors.PluginActivateInvalid);
      return definition;
    } finally {
      await rm(input, { force: true });
    }
  };
  return {
    owner,
    hash,
    load: () => (pending ??= load()),
    async release() {
      // Wait for even a rejected import to settle before unlinking its module.
      try {
        await pending;
      } catch {
        /* The host reports load failures. */
      }
      await rm(output, { force: true });
    },
  };
};
