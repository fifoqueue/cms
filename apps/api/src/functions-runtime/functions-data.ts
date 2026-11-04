import type { SettingsRepository } from '#api/domain/site/site-service';
import type { PluginDataRepository } from '#api/plugin-runtime/ports';

/** Independent keys avoid plugin foreign keys and cross-key lost updates. */
export const functionsData = (
  settings: SettingsRepository,
): PluginDataRepository => {
  const prefix = (owner: string, scope: string) =>
    `functions.data.${encodeURIComponent(owner)}.${scope}.`;
  const path = (owner: string, scope: string, key: string) =>
    `${prefix(owner, scope)}${encodeURIComponent(key)}`;

  return {
    get: async (owner, scope, key) => {
      const stored = await settings.get(path(owner, scope, key));

      return stored === null || stored === undefined
        ? undefined
        : (stored as { value: unknown }).value;
    },
    set: (owner, scope, key, value) =>
      settings.set(path(owner, scope, key), { value }),
    delete: (owner, scope, key) => settings.set(path(owner, scope, key), null),
    entries: async (owner, scope) => {
      const base = prefix(owner, scope);

      return Object.fromEntries(
        Object.entries(await settings.list(base))
          .filter(([, value]) => value !== null)
          .map(([key, value]) => [
            decodeURIComponent(key.slice(base.length)),
            (value as { value: unknown }).value,
          ]),
      );
    },
  };
};
