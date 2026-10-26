# API

Everything below is pure: no host globals, no I/O. Version 0.2.0. Rule ids, field ids and lookup table ids are the keys; a miss returns `undefined` and never throws.

## Entry points

```ts
import { parse, check, serialize } from '@royalti/cwr';             // the full API
import { parse, check } from '@royalti/cwr/lite';                    // the same API without lookupLabel and lookupRow
import { SOURCES, sourceInfo, ruleCitations } from '@royalti/cwr/reference';
```

In this package the three builds carry the same data. No rule, field or table carries a quotation from the specifications, so `lite` is not smaller than the full build; it stays so a page can keep importing it in a worker.

## Parse, check, serialize

```ts
parse(bytes, { version?, fileName?, maxBytes?, onProgress?, signal? }): CwrDoc
check(doc, { maxPerRule?, disable?, registry?, onProgress?, signal? }): CheckResult
serialize(doc, { eol?: 'keep' | 'crlf' }): Uint8Array
setField(doc, ref, fieldId, value, { overflow?, uppercase? }): SetFieldResult
forkDoc(doc): CwrDoc            // a copy that owns its edits, for undo
renumber(doc): RenumberChange[] // recompute the group and file counts
```

`CheckResult` is `{ problems, checked, summary, version, suppressed }`. `summary.text` reads `No problems found in 2,259 checks` or `3 problems in 1,204 checks: 2 errors, 1 warning`. A `Problem` has `ruleId`, `severity`, `scope`, `message`, a `headline` of at most 80 characters, `line` (0-based, -1 for the whole file), `span` (0-based characters on that line), `fieldId`, `params` and `related` spans.

Rules are data plus a function: `defineRule({ id, title, severity, scope, versions, message, source: { slug, quote }, run(ctx) })`. `createRegistry(rules)` builds a registry; `BUILTIN_RULES` is the built-in list.

## Field information

```ts
fieldInfo('2.2', 'SWR', 'prOwnershipShare'): FieldInfo | undefined   // name, start (1-based), size, format, req, lookup, block, slug
fieldInfos('2.1', 'NWR'): FieldInfo[]                               // every field of a record, in spec order
FIELD_FORMAT_NAMES, FIELD_REQ_NAMES                                  // 'N' -> 'numeric', 'M' -> 'mandatory'
```

`recordType` may be an alias (`REV`, `OPU`). `FieldInfo` has no quote; `notes` is never set.

## Work summaries

```ts
workSummary(doc, txn): WorkSummary     // one NWR, REV, ISW or EXC transaction
workSummaries(doc): WorkSummary[]      // every such transaction, in file order
formatShare(5000)                      // '50.00%'
```

Shares are ownership shares in hundredths of a percent (`5000` is 50.00%). A share that cannot be read is `null`, and any total built on it is `null` too. `balanced` mirrors the share rule: 100% within the 0.06% margin, or 0%.

## Progress and cancel

```ts
parse(bytes, { onProgress, signal }); check(doc, { onProgress, signal });
parseSteps(bytes), checkSteps(doc)     // generators: call next(), give the event loop a turn between calls
createCancelToken(): { signal, cancel() }
class CancelledError extends Error { code: 'CANCELLED' }
```

`signal` is any object with a boolean `aborted`; a DOM `AbortSignal` fits. `fraction` runs from 0 to 1 across the whole task and never decreases.

## Is it a CWR file?

```ts
sniff(bytes, { fileName? }): { kind: 'cwr2' | 'cwr3' | 'binary' | 'unknown', reason, version?, detected?, firstLine, recordsSeen }
```

It reads at most 64 KB and never throws. `cwr3` follows the same rule as `parse`, so the two never disagree about what throws `UnsupportedVersionError`.

## The reference module

```ts
ruleCitations(ruleId): { source: Citation; alsoSource: Citation[] } | undefined   // Citation = { slug, quote }; quote is ''
fieldCitation(version, recordType, fieldId): { slug, quote } | undefined
editCitation(version, recordType, fieldId): { edit: 'NWR-F-005', citation } | undefined
citationsFor(problem, doc): { rule, field, edit }
sourceInfo(slug): { title, url?, access?: 'members', edition? } | undefined;  SOURCES
lookupLabel(table, code), lookupRow(table, code)     // no labels in this package, except tis 2136 = World
```

In the main entry, `lookupLabel('societyCode', '010')` returns the society's short name (`ASCAP`): the one lookup text the engine keeps, because a rule compares publisher names to it. The reference module has no lookup rows.

This is how a page names the document behind a problem and links to it. The CISAC addresses are member-portal links (`access: 'members'`): show the title and treat the link as optional. The quote is always the empty string.

## Synthetic files

`generateCwr({ version, works, otherParties?, ... })` writes a CWR file made only of invented content (fictional names, made-up IPI numbers with valid check digits). It is what the tests and the benchmarks use.
