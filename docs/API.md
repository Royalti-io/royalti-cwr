# API

Everything below is pure: no host globals, no I/O. Version 0.3.1. Rule ids, field ids and lookup table ids are the keys; a miss returns `undefined` and never throws.

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

`setField` with `uppercase` throws `EditError` with the code `uppercase-script` when upper case would turn a letter into one of another script (the micro sign into a Greek capital mu).

`CheckResult` is `{ problems, checked, summary, version, suppressed }`. `summary.text` reads `No problems found in 2,259 checks` or `3 problems in 1,204 checks: 2 errors, 1 warning`. A `Problem` has `ruleId`, `severity`, `scope`, `message`, a `headline` of at most 80 characters, `line` (0-based, -1 for the whole file), `span` (0-based characters on that line), `fieldId`, `params` and `related` spans.

Rules are data plus a function: `defineRule({ id, title, severity, scope, versions, message, source: { slug, quote }, run(ctx) })`. `createRegistry(rules)` builds a registry; `BUILTIN_RULES` is the built-in list.

## Fix tools

```ts
cleanIdentifiers(doc, { apply?, kinds?, only?, overflow? }): { changes, skipped, needsHuman, applied, doc? }
identifierCheck(kind, value): { kind, ok, checkDigitTested, reason?, found?, expected? }
findReplace(doc, { fields, find, replace, mode, caseSensitive?, apply?, uppercase?, only?: { record: RecRef; fieldId: string }[] }): { ok, error?, changes, refused, applied, doc? }
findDuplicates(doc): { severity: 'info', worksChecked, groups }
extractWorks(doc, selection, { keepHeader?, now?, eol?: 'keep' | 'crlf' }): { ok: true, bytes, doc, stats, ... } | { ok: false, error: { code, message, cause?, refs?, lines? }, checks? }
ownedShares(doc): { works }
worksCsv(doc): Uint8Array            // UTF-8 with a byte order mark
```

Each tool, its guardrails and the choices made where the request was open are in [TOOLS.md](TOOLS.md). They are pure like everything else here: the editing tools work on a copy and never change the document they are given.

`extractWorks` checks the bytes it returns: `eol: 'crlf'` writes CR LF while the file is built, so the guardrails run on the bytes a host saves. `uppercase` in `findReplace` writes the whole field in upper case, and a field whose upper-case form differs from what it holds is a change even when the replacement is the text already there. `only` limits `findReplace` (as it does `cleanIdentifiers`) to named fields, so a one-field fix is one call. A field is edited once however many `fields` specs name it, and a field where `uppercase` would turn a letter into one of another script is refused as `uppercase-script`.

`extractWorks` refuses what renumbering would hide: a chosen record whose own transaction number belongs to another transaction fails the structure guardrail (`error.cause` is `'file'`), a header cut before its dates is `short-header`, an ACK with the EXC that continues it is `ack-continuation`, and a file that mixes text encodings, so that the new file opened on its own reads a chosen record as other text, is `encoding-differs`. A line with no valid record prefix is copied whole and not renumbered. `stats.outsideRecords` and `stats.outsideLines` say how many records of the source sit outside any transaction (none is copied) and where the first ones are. All of it is in [TOOLS.md](TOOLS.md).

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
extractWorksSteps(doc, selection, options), worksCsvSteps(doc), ownedSharesSteps(doc), findDuplicatesSteps(doc)   // the slow fix tools as generators
createCancelToken(): { signal, cancel() }
class CancelledError extends Error { code: 'CANCELLED' }
```

`signal` is any object with a boolean `aborted`; a DOM `AbortSignal` fits. `fraction` runs from 0 to 1 across the whole task and never decreases.

Every generator yields a `Progress` (`{ task, stage, done, total, fraction }`) and returns what the one-shot function returns; the one-shot function runs the generator to its end, so the two agree byte for byte. `task` is `parse`, `check`, `extract`, `works-csv`, `owned-shares` or `duplicates`. The extract stages are `build`, `reparse`, `structure` and `bodies`; the stages of each tool are listed in [TOOLS.md](TOOLS.md). Stopping is not calling `next()` again: the document is only read, so a stopped run leaves nothing behind.

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
