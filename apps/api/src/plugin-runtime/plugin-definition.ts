import { pluginManifestSchema } from '@cms/sdk';
import type { ResolvedManifest } from '@cms/sdk';
import type { PluginDefinition } from '@cms/sdk/plugin';
import { invalidInput } from '../shared/errors';
import { parseInput } from '../shared/validation';

export interface ValidPlugin {
  definition: PluginDefinition;
  manifest: ResolvedManifest;
}

/** Checks the `plugin` export of a bundle against the plugin contract. */
export const validatePlugin = (value: unknown): ValidPlugin => {
  if (typeof value !== 'object' || value === null)
    throw invalidInput('Bundle has no `plugin` export');
  const candidate = value as Partial<PluginDefinition>;
  if (typeof candidate.activate !== 'function')
    throw invalidInput('`plugin.activate` must be a function');
  if (
    candidate.deactivate !== undefined &&
    typeof candidate.deactivate !== 'function'
  ) {
    throw invalidInput('`plugin.deactivate` must be a function');
  }
  return {
    definition: candidate as PluginDefinition,
    manifest: parseInput(pluginManifestSchema, candidate.manifest),
  };
};
