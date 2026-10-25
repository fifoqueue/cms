import type { ProfileValues, profileMetaSchema } from '@cms/sdk/plugin';

/** What the API reports: active plugin field declarations and the user's visible values. */
export type ProfileMeta = ReturnType<(typeof profileMetaSchema)['parse']>;

/** Plugin profile fields post as `profile.<key>`, apart from the core profile inputs. */
export const PROFILE_FIELD_PREFIX = 'profile.';

/** A field as the form renders it; `source` is the declaring plugin (keys are `<plugin>:<key>`). */
export type ProfileFieldRow = { key: string; label: string; source: string } & (
  | { type: 'text'; maxLength: number; value: string }
  | { type: 'number'; min?: number; max?: number; value: string }
  | { type: 'boolean'; value: boolean }
);

const sourceOf = (key: string) => key.slice(0, Math.max(key.indexOf(':'), 0));

/**
 * Rows in declaration order. `typed` (the posted text after a refusal) wins over the stored value
 * so nothing typed is lost; it only ever holds this user's own values.
 */
export const profileFieldRows = (
  meta: ProfileMeta,
  typed?: Record<string, string | boolean>,
): ProfileFieldRow[] =>
  meta.fields.map(({ key, definition }) => {
    const base = { key, label: definition.label, source: sourceOf(key) };
    const stored = meta.values[key];
    const echo = typed && Object.hasOwn(typed, key) ? typed[key] : undefined;
    if (definition.type === 'boolean')
      return {
        ...base,
        type: 'boolean',
        value: typeof echo === 'boolean' ? echo : stored === true,
      };
    const value =
      typeof echo === 'string'
        ? echo
        : stored === undefined || typeof stored === 'boolean'
          ? ''
          : String(stored);
    return definition.type === 'text'
      ? { ...base, type: 'text', maxLength: definition.maxLength, value }
      : {
          ...base,
          type: 'number',
          ...(definition.min !== undefined && { min: definition.min }),
          ...(definition.max !== undefined && { max: definition.max }),
          value,
        };
  });

export interface ProfileFieldsForm {
  /** What goes to the API; the API checks every bound again. */
  values: ProfileValues;
  /** The posted text per key, to show again after a refusal. */
  typed: Record<string, string | boolean>;
  /** Fields that cannot be sent as typed (a number that is not one), by key. */
  invalid: string[];
}

/**
 * Reads exactly the declared fields. An unchecked box is `false`; an empty number is left out
 * (the API keeps what is stored); text is sent as typed.
 */
export const readProfileFields = (
  form: FormData,
  meta: Pick<ProfileMeta, 'fields'>,
): ProfileFieldsForm => {
  const values: ProfileValues = {};
  const typed: Record<string, string | boolean> = {};
  const invalid: string[] = [];
  for (const { key, definition } of meta.fields) {
    const posted = form.get(PROFILE_FIELD_PREFIX + key);
    if (definition.type === 'boolean') {
      values[key] = typed[key] = posted !== null;
      continue;
    }
    const text = typeof posted === 'string' ? posted : '';
    typed[key] = text;
    if (definition.type === 'text') values[key] = text;
    else if (text.trim() !== '') {
      const number = Number(text);
      if (Number.isFinite(number)) values[key] = number;
      else invalid.push(key);
    }
  }
  return { values, typed, invalid };
};

export interface ProfileFieldsRefusal {
  message: string;
  code?: string;
  issues: { path: string; message: string }[];
  typed: Record<string, string | boolean>;
}

const isIssue = (value: unknown): value is { path: string; message: string } =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as { path?: unknown }).path === 'string' &&
  typeof (value as { message?: unknown }).message === 'string';

/** The `?/profileFields` refusal among a page's action results, if that is what `form` is. */
export const profileFieldsRefusal = (
  form: unknown,
): ProfileFieldsRefusal | null => {
  if (!form || typeof form !== 'object') return null;
  const result = form as Record<string, unknown>;
  if (result.profileFields !== true || typeof result.message !== 'string')
    return null;
  const typed: Record<string, string | boolean> = {};
  if (result.typed && typeof result.typed === 'object')
    for (const [key, value] of Object.entries(result.typed))
      if (typeof value === 'string' || typeof value === 'boolean')
        typed[key] = value;
  return {
    message: result.message,
    ...(typeof result.code === 'string' && { code: result.code }),
    issues: Array.isArray(result.issues) ? result.issues.filter(isIssue) : [],
    typed,
  };
};

/**
 * A refused save's issues: the first per field goes next to it, the rest (paths that name no
 * field) stays in the page message.
 */
export const splitProfileIssues = (
  issues: readonly { path: string; message: string }[],
  meta: Pick<ProfileMeta, 'fields'>,
) => {
  const placed: Partial<Record<string, string>> = {};
  const apart: { path: string; message: string }[] = [];
  for (const issue of issues) {
    const key = profileIssueKey(issue.path, meta);
    if (key) placed[key] ??= issue.message;
    else apart.push(issue);
  }
  return { placed, apart };
};

/** An issue's field: its path is the field key (keys contain `:`, so never split it). */
export const profileIssueKey = (
  path: string,
  meta: Pick<ProfileMeta, 'fields'>,
) => (meta.fields.some(({ key }) => key === path) ? path : null);
