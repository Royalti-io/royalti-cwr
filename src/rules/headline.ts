/** The longest headline, in characters, ellipsis included. */
export const HEADLINE_MAX = 80;

const ABBREVIATIONS = /(?:e\.g|i\.e|etc|vs|no|approx)$/i;

/**
 * A short form of a problem message for a list row: its first sentence, cut to `HEADLINE_MAX` characters.
 * A first sentence that is too long is cut at the last `;`, `,`, ` - ` or ` (` that leaves at least 24 characters,
 * else at the last space, and ends in an ellipsis. The closing full stop is dropped. Never empty for a non-empty message.
 */
export function headlineOf(message: string): string {
  const text = message.trim();
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 46 && c !== 33 && c !== 63) continue; // . ! ?
    // a decimal point or a dot inside a token ("2.1", "NWR.x") is not a sentence end
    const next = text.charCodeAt(i + 1);
    if (i + 1 < text.length && next !== 32) continue;
    if (c === 46 && ABBREVIATIONS.test(text.slice(Math.max(0, i - 4), i))) continue;
    // a sentence end is followed by a capital letter or by nothing ("USA License Ind. "."..." has no end there)
    let j = i + 1;
    while (j < text.length && text.charCodeAt(j) === 32) j++;
    if (j < text.length) {
      const ch = text[j]!;
      if (!(ch >= 'A' && ch <= 'Z')) continue;
    }
    end = i;
    break;
  }
  let head = text.slice(0, end).trim();
  if (head.length <= HEADLINE_MAX) return head;

  const limit = HEADLINE_MAX - 1; // room for the ellipsis
  const window = head.slice(0, limit + 1);
  let cut = -1;
  for (const sep of ['; ', ', ', ' - ', ' (']) {
    const at = window.lastIndexOf(sep, limit);
    if (at >= 24 && at > cut) cut = at;
  }
  if (cut < 0) {
    const sp = window.lastIndexOf(' ', limit);
    cut = sp >= 24 ? sp : limit;
  }
  head = head.slice(0, cut).replace(/[\s,;:(-]+$/, '');
  return `${head}…`;
}

/** Fills a headline template the same way messages are filled, then clamps it. */
export function clampHeadline(text: string): string {
  return text.length <= HEADLINE_MAX ? text : headlineOf(text);
}
