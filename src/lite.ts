// The lite entry (`@royalti/cwr/lite`): the same API as the full entry, minus `lookupLabel` and `lookupRow`.
// This package carries no passages or quotations from the specifications, so both entries hold the same data; `lite` stays so a page can keep importing it in a worker.
// Resolve the documents behind a rule or field with `@royalti/cwr/reference`, a separate module.
export * from './api';
