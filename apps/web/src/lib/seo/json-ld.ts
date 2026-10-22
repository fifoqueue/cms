const UNSAFE_CHARS = /[<>&\u2028\u2029]/g;

/**
 * A complete `<script type="application/ld+json">` element. Every `<`, `>` and `&` in the JSON
 * is written as a `\uXXXX` escape (same JSON value), so text such as `</script>` or `<!--`
 * from content can never end or alter the element.
 */
export const jsonLdScript = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data).replace(
    UNSAFE_CHARS,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )}</script>`;
