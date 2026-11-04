import type { SettingsSection } from '@cms/sdk/plugin';
import type { HookDispatcher } from '#api/domain/ports';

type Section = SettingsSection['section'];
type Payload<S extends Section> = Extract<SettingsSection, { section: S }>;

type ParseResult<T> = { success: true; data: T } | { success: false };

export type SettingsProjection<T, S extends Section> = {
  redact(value: T): Payload<S>;
  restore(value: Payload<S>, original: T): T;
  parse(value: unknown): ParseResult<T>;
} & (
  | { boundFields?: never; parseSettings?: never }
  | {
      /** Dot-separated settings paths; `*` selects every array element. */
      boundFields: readonly string[];
      /** Validates and normalizes candidate settings without restoring credentials or destinations. */
      parseSettings(value: unknown): ParseResult<unknown>;
    }
);

const boundValue = (value: unknown, path: readonly string[]): unknown => {
  if (!path.length) return value;

  const [key, ...rest] = path;

  if (key === '*')
    return Array.isArray(value)
      ? value.map((entry) => boundValue(entry, rest))
      : undefined;

  return value && typeof value === 'object' && Object.hasOwn(value, key!)
    ? boundValue((value as Record<string, unknown>)[key!], rest)
    : undefined;
};

/** Only redacted values reach handlers; section and plugin identity cannot change. */
export const filterSettings = async <T, S extends Section>(
  hooks: HookDispatcher | undefined,
  value: T,
  projection: SettingsProjection<T, S>,
): Promise<T> => {
  if (!hooks?.has('settings.beforeSave')) return value;

  const original = structuredClone(value);
  const payload = projection.redact(structuredClone(original));
  const bounds = projection.boundFields?.map((field) => {
    const path = field.split('.');

    return { path, value: JSON.stringify(boundValue(payload.settings, path)) };
  });
  const section = payload.section;
  const id = 'id' in payload ? payload.id : undefined;
  const result = await hooks.applyFilter(
    'settings.beforeSave',
    payload,
    (candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;

      const next = candidate as Payload<S>;

      if (next.section !== section) return false;
      if (id !== undefined && (!('id' in next) || next.id !== id)) return false;

      if (projection.boundFields) {
        const parsed = projection.parseSettings(next.settings);

        if (!parsed.success) return false;
        if (
          !bounds!.every(
            ({ path, value }) =>
              JSON.stringify(boundValue(parsed.data, path)) === value,
          )
        )
          return false;
      }

      return projection.parse(projection.restore(next, original)).success;
    },
  );
  const parsed = projection.parse(
    projection.restore(result as Payload<S>, original),
  );

  return parsed.success ? parsed.data : value;
};

/** Called only after the section write has committed. */
export const settingsUpdated = <T, S extends Section>(
  hooks: HookDispatcher | undefined,
  value: T,
  projection: Pick<SettingsProjection<T, S>, 'redact'>,
): void => {
  if (!hooks?.has('settings.updated')) return;

  void hooks.emit('settings.updated', projection.redact(value));
};
