/** Registered replacement text by catalog key, for one locale and scope. */
export type Overrides = Record<string, string>;

/** Error lookups map codes to copy and are never replaced as a whole. */
export const LOOKUP_KEYS: ReadonlySet<string> = new Set([
  'apiError',
  'webError',
]);

const PLACEHOLDER = /\{(\w+)\}/g;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const display = (value: unknown, language: string) =>
  Array.isArray(value)
    ? new Intl.ListFormat(language, { type: 'conjunction' }).format(
        value.map(String),
      )
    : String(value);

/**
 * Replaces each `{name}` with its parameter as plain text. Placeholders without a value stay as
 * written. The result is text: renderers escape it like any other message.
 */
export const interpolate = (
  text: string,
  params: Record<string, unknown>,
  language: string,
) =>
  text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;

    return value === undefined || value === null
      ? placeholder
      : display(value, language);
  });

/** Positional arguments by placeholder name; an object argument also names its own properties. */
const named = (names: readonly string[], args: unknown[]) => {
  const params: Record<string, unknown> = {};

  args.forEach((value, index) => {
    const name = names[index];

    if (name !== undefined) params[name] = value;
    if (isRecord(value)) Object.assign(params, value);
  });

  return params;
};

/**
 * The catalog with registered text applied. Only existing keys change: a plain message takes the
 * text as is, a parameterized message listed in `params` interpolates the text with the same
 * arguments. Other keys, unlisted functions and error lookups keep the core message.
 */
export const applyOverrides = <M extends object>(
  messages: M,
  overrides: Overrides,
  params: Readonly<Record<string, readonly string[]>>,
  language: string,
): M => {
  const merged = { ...messages } as Record<string, unknown>;

  for (const [key, text] of Object.entries(overrides)) {
    if (!Object.hasOwn(merged, key) || LOOKUP_KEYS.has(key)) continue;
    const current = merged[key];

    if (typeof current === 'string') {
      merged[key] = text;
    } else if (typeof current === 'function' && Object.hasOwn(params, key)) {
      const names = params[key]!;

      merged[key] = (...args: unknown[]) =>
        interpolate(text, named(names, args), language);
    }
  }

  return merged as M;
};

/** Only the entries for `keys`, so page data carries no unused text. */
export const pickOverrides = (
  overrides: Overrides,
  keys: ReadonlySet<string>,
): Overrides =>
  Object.fromEntries(
    Object.entries(overrides).filter(([key]) => keys.has(key)),
  );
