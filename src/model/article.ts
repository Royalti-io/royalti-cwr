/**
 * `an NWR record`, `a GRH record`, `an IPI name number`: the article for a record type or identifier name written in capitals.
 * Codes are read letter by letter, so a code starting with A, E, F, H, I, L, M, N, O, S or X takes "an". R is left out
 * on purpose: REV and REC are said as words ("a REV record"). Not for lower-case words (`an ascii`, `a latin1`).
 */
export function withArticle(code: string): string {
  return `${/^[AEFHILMNOSX]/.test(code) ? 'an' : 'a'} ${code}`;
}
