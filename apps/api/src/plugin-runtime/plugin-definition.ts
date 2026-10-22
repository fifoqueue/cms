import { pluginManifestSchema } from '@cms/sdk';
import type { ResolvedManifest } from '@cms/sdk';
import type { PluginDefinition } from '@cms/sdk/plugin';
import { invalidInput, Errors } from '#api/shared/errors';
import { parseInput } from '#api/shared/validation';

export interface ValidPlugin {
  definition: PluginDefinition;
  manifest: ResolvedManifest;
}

/** Checks the `plugin` export of a bundle against the plugin contract. */
export const validatePlugin = (value: unknown): ValidPlugin => {
  if (typeof value !== 'object' || value === null)
    throw invalidInput(Errors.PluginExportMissing);
  const candidate = value as Partial<PluginDefinition>;
  if (typeof candidate.activate !== 'function')
    throw invalidInput(Errors.PluginActivateInvalid);
  if (
    candidate.deactivate !== undefined &&
    typeof candidate.deactivate !== 'function'
  ) {
    throw invalidInput(Errors.PluginDeactivateInvalid);
  }
  return {
    definition: candidate as PluginDefinition,
    manifest: parseInput(pluginManifestSchema, candidate.manifest),
  };
};
