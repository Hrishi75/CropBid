// =============================================================================
// A value written into an inline <script>, safely
// =============================================================================
// JSON.stringify quotes a string for JavaScript, not for HTML. The browser
// ends a <script> block at the first "</script" it meets, before JavaScript
// ever sees the quotes, so a shopper whose name is
// `</script><script>...</script>` would run their own code in the checkout
// page, which can post a fake "paid" message to the app.
//
// Escaping every <, > and & as a \u sequence keeps the text identical once
// JavaScript reads it, and leaves the HTML parser nothing to end the block
// on. U+2028 and U+2029 are escaped too: they are valid in JSON but ended a
// string literal in older JavaScript engines.
// =============================================================================

const UNSAFE: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function scriptJson(value: unknown): string {
  const json = JSON.stringify(value);
  // undefined has no JSON form; "null" keeps the script valid.
  if (json === undefined) return 'null';
  return json.replace(/[<>&\u2028\u2029]/g, (c) => UNSAFE[c]);
}
