import { RE2JS } from 're2js';

export interface EmbedMatcher {
  names: string[];
  match(value: string): Record<string, string | null> | null;
  test(value: string): boolean;
}

/** RE2 syntax only, with no optional lookbehind extensions or native RegExp fallback. */
export const compileEmbedPattern = (source: string): EmbedMatcher | null => {
  if (!source.startsWith('^')) return null;
  try {
    const pattern = RE2JS.compile(source);
    const names = Object.keys(pattern.namedGroups());
    return {
      names,
      test: (value) => value.length <= 2048 && pattern.test(value),
      match(value) {
        // Use RE2JS's DFA test before requesting captures (the NFA capture pass is
        // unnecessary for the overwhelmingly common nonmatching provider).
        if (value.length > 2048 || !pattern.test(value)) return null;
        const matcher = pattern.matcher(value);
        if (!matcher.find()) return null;
        return Object.fromEntries(
          names.map((name) => [name, matcher.group(name)]),
        );
      },
    };
  } catch {
    return null;
  }
};
