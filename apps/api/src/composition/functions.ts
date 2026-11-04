import { pluginManifestSchema } from '@cms/sdk';
import { FunctionsHost } from '#api/functions-runtime/functions-host';
import { functionsData } from '#api/functions-runtime/functions-data';
import { SiteSource } from '#api/infra/functions/site-source';
import { versionedSource } from '#api/infra/functions/versioned-source';
import { FunctionsWatch } from '#api/infra/functions/functions-watch';
import { SiteEditor } from '#api/infra/functions/site-editor';
import type { PluginContextFactory } from '#api/plugin-runtime/plugin-context-factory';
import type { ThemeService } from '#api/domain/theme/theme-service';
import type { Logger } from '#api/shared/logger';
import type { HookDispatcher } from '#api/domain/ports';

export const createFunctions = ({
  directory,
  enabled,
  settings,
  themes,
  hooks,
  contexts,
  invalidate,
  logger,
}: {
  directory: string;
  enabled: boolean;
  settings: Parameters<typeof functionsData>[0];
  themes: Pick<ThemeService, 'activeFunctions' | 'activeIdentity'>;
  hooks: HookDispatcher;
  contexts: Pick<PluginContextFactory, 'create'>;
  invalidate: () => void;
  logger: Logger;
}) => {
  const siteSource = new SiteSource(directory);
  const sourceData = functionsData(settings);
  const functionsHost = new FunctionsHost({
    theme: () => themes.activeIdentity(),
    hooks,
    sources: async () => {
      const theme = await themes.activeFunctions();
      const source = await siteSource.source();

      return [
        ...(theme
          ? [versionedSource(siteSource.directory, theme.owner, theme.text)]
          : []),
        ...(source ? [source] : []),
      ];
    },
    context: (owner, scope) =>
      contexts.create(
        {
          ...pluginManifestSchema.parse({
            id: 'site-functions',
            name: 'Site functions',
            version: '1.0.0',
          }),
          id: owner,
        },
        scope,
        { trusted: true, data: sourceData },
      ),
    logger,
    invalidate,
  });
  const functionsWatch = new FunctionsWatch(
    siteSource.directory,
    functionsHost,
    logger,
  );
  const functionsEditor = new SiteEditor(
    siteSource.directory,
    enabled,
    functionsHost,
    logger,
  );

  return { functionsHost, functionsWatch, functionsEditor };
};
