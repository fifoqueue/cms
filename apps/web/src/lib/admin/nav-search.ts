/**
 * Matching for the admin screen search. Case-insensitive; every word of the query has to match
 * the screen's name, its menu section's name or one of its keywords, in any admin language.
 * A lone Korean initial consonant matches syllables that start with it (`ㄱㅇ` finds `고유주소`).
 */

export interface Searchable {
  /** The screen's name in every admin language. */
  labels: readonly string[];
  /** Its menu section's name in every admin language (same order as `labels`). */
  groups: readonly string[];
  /** Other words that find it. */
  keywords?: readonly string[];
}

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
/** Syllables per initial consonant: 21 vowels × 28 finals. */
const PER_INITIAL = 588;
/** The 19 initial consonants in syllable order, as a keyboard types them alone. */
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

const initialOf = (char: string) => {
  const code = char.charCodeAt(0);
  return code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST
    ? INITIALS[Math.floor((code - SYLLABLE_FIRST) / PER_INITIAL)]
    : char;
};

const same = (query: string, text: string) =>
  query === text || (INITIALS.includes(query) && initialOf(text) === query);

const normalize = (text: string) => text.normalize('NFC').toLowerCase().trim();

/** Where `token` starts in `text` (at or after `from`), or -1. */
const find = (token: string[], text: string[], from = 0) => {
  for (let start = from; start + token.length <= text.length; start++)
    if (token.every((char, index) => same(char, text[start + index]!)))
      return start;
  return -1;
};

const inOrder = (token: string[], text: string[]) => {
  let at = 0;
  for (const char of text)
    if (at < token.length && same(token[at]!, char)) at++;
  return at === token.length;
};

const WORD_START = /[\s\p{P}]/u;

/** How well one query word fits one text: whole, start, word start, inside, scattered. */
const fit = (token: string[], text: string[]): number => {
  const at = find(token, text);
  if (at === 0) return token.length === text.length ? 100 : 80;
  if (at > 0) {
    for (let start = at; start >= 0; start = find(token, text, start + 1))
      if (WORD_START.test(text[start - 1]!)) return 60;
    return 40;
  }
  return token.length > 1 && inOrder(token, text) ? 10 : 0;
};

const fitText = (token: string[], text: string) => {
  const plain = normalize(text);
  return Math.max(
    fit(token, [...plain]),
    fit(token, [...plain.replace(/\s+/g, '')]),
  );
};

/**
 * The entry's score for `query` (higher is better), or `null` when a word of it matches nothing.
 * An empty query matches everything with 0.
 */
export const matchScore = (entry: Searchable, query: string): number | null => {
  const fields: [text: string, weight: number][] = [
    ...entry.labels.map((text): [string, number] => [text, 1]),
    ...(entry.keywords ?? []).map((text): [string, number] => [text, 0.9]),
    // "설정고유" written as one word still finds Settings › Permalinks.
    ...entry.labels.map((text, index): [string, number] => [
      `${entry.groups[index] ?? ''} ${text}`,
      0.8,
    ]),
    ...entry.groups.map((text): [string, number] => [text, 0.5]),
  ];
  let total = 0;
  for (const word of normalize(query).split(/\s+/).filter(Boolean)) {
    const token = [...word];
    const best = Math.max(
      ...fields.map(([text, weight]) => fitText(token, text) * weight),
    );
    if (best === 0) return null;
    total += best;
  }
  return total;
};

/** The entries matching `query`, best first; ties keep their order (the menu's). */
export const searchNav = <T extends Searchable>(
  entries: readonly T[],
  query: string,
): T[] =>
  entries
    .map((entry) => ({ entry, score: matchScore(entry, query) }))
    .filter(
      (result): result is { entry: T; score: number } => result.score !== null,
    )
    .sort((a, b) => b.score - a.score)
    .map((result) => result.entry);
