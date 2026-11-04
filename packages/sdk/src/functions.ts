import type { Awaitable } from '#sdk/common';
import type { PluginContext } from '#sdk/plugin';
import { z } from 'zod';

export const functionsInputSchema = z.strictObject({
  source: z.string().max(262144),
});
export const functionsSourceSchema = z.strictObject({
  source: z.string(),
});
export const functionsStatusSchema = z.strictObject({
  editorEnabled: z.boolean(),
  checkedAt: z.string(),
  sources: z.array(
    z.strictObject({
      owner: z.string(),
      observedHash: z.string(),
      loadedHash: z.string().nullable(),
      lastError: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
});

/** API functions have the same capabilities as plugin activation. */
export type ApiFunctionsContext = PluginContext;

/** Reserved for the web runtime; no web capabilities are available in phase 1. */
export type WebFunctionsContext = Readonly<Record<string, never>>;

export interface FunctionsDefinition {
  api?(ctx: ApiFunctionsContext): Awaitable<void>;
  web?(ctx: WebFunctionsContext): Awaitable<void>;
}

/**
 * Export as `export const functions = defineFunctions({ api(ctx) {} })`.
 * Only the API member is intended for execution by the phase-1 runtime.
 */
export const defineFunctions = (
  definition: FunctionsDefinition,
): FunctionsDefinition => definition;
