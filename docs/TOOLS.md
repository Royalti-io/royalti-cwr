# Fix tools

Six tools that go with the checker: three that change or rebuild a file (clean identifiers, find and replace, extract works) and three that only read it (flag duplicates, owned shares, works CSV). They are plain functions over a parsed document (`CwrDoc`), part of the main entry and of `@royalti/cwr/lite`. Like the rest of the package they are pure: no host globals, no I/O, bytes in and bytes out.

```ts
import { parse, serialize, cleanIdentifiers, findReplace, findDuplicates, extractWorks, ownedShares, worksCsv } from '@royalti/cwr';

const doc = parse(bytes);
const fixed = cleanIdentifiers(doc, { apply: true });     // preview first without apply
const bytesOut = serialize(fixed.doc!);
```

## How they behave

- **The input is never changed.** A tool that edits works on a copy (`forkDoc`) and returns it. Keep the previous document and you have an undo.
- **Preview first.** `cleanIdentifiers` and `findReplace` list every change (`changes`) and return no document until you pass `apply: true`. The preview and the applied result are the same list.
- **Edits go through `setField`.** The characters of the edited field change and nothing else does: the rest of the line, every other line and every line ending stay byte for byte. Tests compare the bytes before and after.
- **Lines are 0-based**, as in `Problem.line`. `start` and `end` are 0-based character offsets on the line, end excluded.
- **A refusal is a result, not an exception.** A request a tool will not carry out comes back as `ok: false` with a `code` and a plain `message`. The tools throw only for a bug.

**The slow tools can report progress and be stopped.** `extractWorksSteps`, `worksCsvSteps`, `ownedSharesSteps` and `findDuplicatesSteps` are the four read-or-rebuild tools as generators, shaped like `checkSteps` (see "Progress and stopping" below). The one-shot functions are thin wrappers around them, so both give the same answer, byte for byte.

A change is described by the same fields everywhere (`ToolChange`):

```ts
{ line, record, recordType, fieldId, fieldName, start, end, before, after }
// before and after are the field's characters with their padding
```

## Clean identifiers

```ts
cleanIdentifiers(doc, { apply?, kinds?, only?, overflow? }): { changes, skipped, needsHuman, applied, doc? }
identifierCheck(kind, value): { kind, ok, checkDigitTested, reason?, found?, expected? }
```

Brings IPI name numbers, IPI base numbers, ISWCs and ISRCs into their written form.

| Kind | Written form | What the tool does |
|---|---|---|
| `ipiName` | 11 digits | Drops spaces, dashes and dots, then pads with zeros on the left to 11, **only if the padded number passes its check digits** (below). |
| `ipiBase` | `I-NNNNNNNNN-C` | Upper-cases, drops separators, adds the `I` if it is missing and puts the hyphens in. |
| `iswc` | `T` and ten digits | Upper-cases, drops dashes, dots and spaces. |
| `isrc` | 12 letters and digits | Upper-cases and drops dashes. |

**Zero padding for IPI name numbers.** The field is 11 characters wide and the number is a label, not a quantity: `00012345678` and `12345678` are different strings, and the file needs the first. So the tool pads and never strips. A number that already has 11 digits is left alone, including eleven zeros. A value that is only zeros (`0`, `00`, `.0.0.0.0.0.`) is not padded to eleven zeros: eleven zeros pass the check-digit test, but they mean no number was entered, and the checker reads them that way. That field is left as it is and listed in `needsHuman` (below).

**Padding is made only when the padded number passes its check digits, and never to give eleven zeros.** A number that lost its leading zeros usually still ends in the right check digits once they are back. One that does not is more likely a wrong number than a short one, and padding it would give a wrong number the right shape. So the tool pads `123471` to `00000123471` (the last two digits are the ones the first nine give), and it leaves `12345678` as it is: padded, it would end in `78` where its first nine digits give `24`. That field is not in `changes` and not in `skipped`; it is in `needsHuman`, for a person to look up:

```ts
{ line, record, recordType, fieldId, fieldName, kind, start, end,
  value,      // the field's characters, padding trimmed: '12345678'
  padded,     // what the tool would have written: '00012345678'
  found,      // the check digits the padded number ends in: '78'
  expected,   // the ones its first nine digits give: '24'
  message }
```

For a value that is only zeros, the entry has `padded: '00000000000'`, `found: '00'`, `expected: '00'`, and a message that says what the tool saw: `"0" is all zeros, so no IPI number was entered, and it is left as it is.` Eleven zeros that are already in the field are not touched and are in no list.

Only IPI name numbers can land there. A base number or an ISWC is not held back by a check digit: `cleanIdentifiers` only changes how it is written. An eleven-digit number with wrong check digits is not touched and not listed either; the checker reports it (`ID-IPI-CHK`).

Guardrails:

- A field that already has its written form is not touched, and neither is a blank field.
- **Check digits are never changed.** A wrong check digit stays wrong. They are tested, for one decision only: whether to pad an IPI name number.
- Upper case here can never write a letter of another script: each identifier is upper-cased and then tested against a pattern of ASCII letters and digits, so a value with the micro sign (`µ`) fails the pattern and goes to `skipped` as `no-valid-form`.
- A value that cannot be brought into the written form without guessing (letters in an IPI number, nine digits where ten are needed, an ISWC without its `T`) goes to `skipped` with the reason `no-valid-form` and is left as it is. A record that ends inside the field goes to `skipped` with `record-too-short`.
- The tool sees only the field's own characters. A dashed ISWC is 15 characters and its field is 11, so what the file holds is a cut-off value with no written form, and it is skipped.
- `overflow` is passed on to `setField` and defaults to `refuse`. The written forms always fit, so it matters only for a layout narrower than expected. A refusal from `setField` is reported in `skipped` as `edit-refused`.
- `kinds` limits the run to some kinds (`['ipiName', 'iswc']`). With `ipiName` left out, nothing is padded and nothing is listed in `needsHuman`.
- `changes`, `skipped` and `needsHuman` are in file order (by line, then by position on the line). `skipped` and `needsHuman` carry `start` and `end` like a change does.
- Running it twice changes nothing the second time, and the second run lists the same `needsHuman` numbers. The tests check this on random input.

**Quick fixes: `only`.** `only: [{ record, fieldId }]` limits the run to the named fields. `record` is the same number a change carries (`IdentifierChange.record`, the index into `doc.records` that `setField` takes), not a line number. A page takes `record` and `fieldId` from a preview row and passes them back:

```ts
const preview = cleanIdentifiers(doc);
const fix = preview.changes[3];
const one = cleanIdentifiers(doc, { only: [{ record: fix.record, fieldId: fix.fieldId }], apply: true });
```

Fields that are not named are neither changed nor reported, so `changes`, `skipped` and `needsHuman` only describe the named fields. An entry that names no identifier field of the document (a record out of range, a field that is not an identifier, a field the record does not have) is ignored, and so is a field that needs nothing; an empty list names nothing. With `kinds`, a field must match both. Applying the previewed changes one by one, in any order, gives the same bytes as applying them all at once (a test checks it).

**Preview and apply are one call.** `apply` is a flag on the same function, so for the same input and options the preview and the applied result list the same `changes`, `skipped` and `needsHuman`. The one exception is a layout narrower than expected, where `setField` can refuse a change that a preview cannot know about; the applied result then moves it from `changes` to `skipped` as `edit-refused`.

**`identifierCheck(kind, value)`** tests one value as it would stand in the file, without changing anything. It does not normalise: a value not in the written form of its kind is `ok: false` with `reason: 'wrong-shape'` (and `'blank'` for an empty field). Spaces around the value, the field's padding, are ignored.

| Kind | `ok` means | `checkDigitTested` |
|---|---|---|
| `ipiName` | 11 digits and the last two are the check digits the first nine give (`ok: false`, `reason: 'check-digit'`, `found` and `expected` otherwise) | true |
| `ipiBase` | `I-NNNNNNNNN-C` and `C` is the check digit the nine digits give | true |
| `iswc` | `T` and ten digits | false: the engine has no ISWC check-digit test, so the last digit is not looked at |
| `isrc` | twelve upper-case letters and digits | false |

The IPI tests are the ones the checker's `ID-IPI-CHK` and `ID-IPIB-CHK` rules use; they rest on a secondary source, so a failure means "look this number up", not "the specification says it is wrong". Eleven zeros pass (their check digits are `00`); the checker treats such a value as not entered.

The helpers `normalizeIpiName`, `normalizeIpiBase`, `normalizeIswc` and `normalizeIsrc` take a string and return the written form or `null`. `normalizeIpiName` pads without testing; the check digit gate and the all-zeros rule are in `cleanIdentifiers`.

When a tool cannot do something with a value it says so in words that name what the tool did, with the right article (`cannot be turned into an IPI name number in its written form without guessing`).

## Find and replace

```ts
findReplace(doc, { fields, find, replace, mode, caseSensitive?, apply?, uppercase?, only? }): { ok, error?, changes, refused, applied, doc? }
findReplaceFields(version): { id, name, records }[]     // what the tool may be pointed at
classifyField(field): 'text' | 'prefix' | 'numeric' | 'share' | 'code' | 'identifier' | 'unsupported'
```

- `fields` are field ids (`workTitle`), optionally with a record type in front (`SWR.writerLastName`; an alias such as `OWR` resolves to its layout). **A field is edited once however many specs name it:** `['workTitle', 'NWR.workTitle']`, or the same spec twice, resolve to one set of (record, field) targets before anything is edited, so the replacement never runs on a field it has already changed. Before 0.3.1 the second spec ran on the edited text.
- `mode: 'whole'` matches when the field, ignoring the padding, equals `find`, and `replace` becomes the whole field. `mode: 'substring'` replaces every occurrence of `find` inside the field. `find` is taken literally, not as a pattern, and so is `replace`.
- `caseSensitive` defaults to false.
- **`uppercase` writes the whole field in upper case, not only the replacement.** The text around a replaced part is upper-cased too: `Even Lantern 00005` with `lantern` replaced by `lamp` becomes `EVEN LAMP 00005`. By default the field is written as the replacement leaves it.
- **Upper case counts as a change.** A field that matches `find` is changed whenever the result, upper-cased, differs from what the field holds. So searching a field for its own text with `uppercase` on writes the field in upper case (`Even Lantern 00005` found and replaced by `Even Lantern 00005` becomes `EVEN LANTERN 00005`), and a field that is already in upper case is left alone. Before 0.3.1 the check for "nothing changed" ran before the upper-casing, so that search changed nothing. Without `uppercase` a replacement equal to the field is still no change. A result that upper case makes longer than the field (`ß` becomes `SS`) is refused as `overflow`, with `after` showing the upper-case text.
- **Upper case that moves a letter to another script is refused.** In a UTF-8 file the micro sign `µ` (U+00B5) upper-cases to the Greek capital mu `Μ` (U+039C), and a combining ypogegrammeni mark upper-cases to a Greek iota. A field where `uppercase` would do that is refused as `uppercase-script`, like an `overflow` (`after` shows the text it would have written, and `apply` writes nothing). A letter that stays in its script is not refused: `é` to `É`, `ÿ` to `Ÿ` (both Latin), `ß` to `SS`, Greek `ς` to `Σ`, Cyrillic to Cyrillic. The test uses `\p{Script=Latin}`, `\p{Script=Greek}` and `\p{Script=Cyrillic}`; a letter that upper case takes into one of them from outside it (Common, Inherited, or another script) is the move. `setField(..., { uppercase: true })` throws `EditError` with the code `uppercase-script` for the same value. In a Latin-1 or ASCII file the capital cannot be written at all, and `not-encodable` is reported first, as before. The checker's own upper-case rule (`FMT-UC`) is not changed, so a field of that kind is still reported there and cannot be fixed by this option.
- **`only` limits the call to named fields**, as it does for `cleanIdentifiers`: `only: [{ record, fieldId }]`, where `record` is the same number a change carries (`ToolChange.record`, the index into `doc.records`), not a line number. A page takes `record` and `fieldId` from a preview row and passes them back, so a one-field quick fix is one call whose preview and apply list the same change. Fields that are not named are neither changed nor reported. An entry that names no field this call searches (a record out of range, a field that is not in `fields`, a field the record does not have) is ignored; an empty list names nothing. The request itself (`fields`, `find`, `replace`) is still checked, so a refused request is refused the same way with or without `only`. A change that cannot be written blocks an `apply` only when it is one of the named fields. Applying the previewed changes one at a time gives the same bytes as applying them all at once.

```ts
const preview = findReplace(doc, { fields: ['workTitle'], find: 'Even Lantern', replace: 'Even Lantern', mode: 'substring', caseSensitive: true, uppercase: true });
const one = findReplace(doc, { ...sameOptions, only: [{ record: preview.changes[0].record, fieldId: 'workTitle' }], apply: true });
```

Guardrails:

- **Only an allow list of text fields can be searched**: titles, personal and company names, artist, label and library names, and a few similar fields. `findReplaceFields(version)` lists them.
- **A prefix, numeric, share, code or identifier field is refused**, and so is any other field that is not on the list. The call returns `ok: false`, `error.code === 'field-refused'` and `error.fields` naming each field with its kind. Nothing is skipped quietly, and one refused field refuses the whole request. An id that does not exist gives `unknown-field`.
- A change that cannot be written goes to `refused` with its reason: `overflow` (the result is longer than the field), `would-blank-mandatory`, `not-encodable` (the file's encoding cannot hold the character), `uppercase-script` (upper case would turn a letter into one of another script; see above), `invalid-value` or `record-too-short`.
- **With `apply`, nothing is applied if anything is refused.** The result is `ok: false` with `error.code === 'changes-refused'`, `applied: false` and no `doc`; `changes` and `refused` still say what would and would not happen. A document is returned only when everything was written.

## Flag duplicates

```ts
findDuplicates(doc): { severity: 'info', worksChecked, groups: DuplicateGroup[] }
withoutLaterDuplicates(doc, report?): RecRef[]        // a selection for extractWorks
```

Read-only. A group has a `reason`, a one-sentence `explanation`, the shared `key`, `severity: 'info'` and two or more `members` (header ref, line, record type, title, work number, ISWC, group index), in file order.

| Reason | Works are grouped when |
|---|---|
| `work-number` | they carry the same Submitter Work # (blank numbers are ignored) |
| `iswc` | they carry the same ISWC, ignoring case, dashes, dots and spaces (blank and all-zero values are ignored) |
| `title-and-writers` | their titles and their sets of writers match, ignoring case, accents, punctuation and spacing |

A work with no named writer is not grouped by title, because there is nothing to compare but the title. A work can appear in more than one group. The grouping is a heuristic, which is why every group is only information: an NWR and the REV that revises it share a number on purpose.

`withoutLaterDuplicates` gives the header refs of every transaction except the later members of a group. Pass it to `extractWorks` to write the file without the repeats.

## Extract works

```ts
extractWorks(doc, selection, { keepHeader?, now?, eol? }): ExtractSuccess | ExtractFailure
extractWorksSteps(doc, selection, { keepHeader?, now?, eol?, onProgress?, signal? }): Generator<Progress, ExtractResult, void>
verifyExtraction(source, selected, outputBytes, { keepHeader? }): ExtractChecks
```

`selection` is a list or set of transaction header refs (`WorkSummary.header`). The result is a new file:

1. The file header. Its creation date, creation time and transmission date are set to `now` (UTC; the default is the current time) unless `keepHeader` is true.
2. For each group that still has a chosen transaction: the group header with its id renumbered from 1, the chosen transactions in file order, and a group trailer with fresh counts. A group with nothing chosen is dropped.
3. The file trailer with fresh group, transaction and record counts.

Transaction numbers restart at 0 in each group and record numbers at 0 in each transaction. Blank lines and records outside any transaction are not copied; the result says how many records were outside (below). The byte order mark and the encoding are kept. Pending edits in the source are part of what is extracted.

**A record with no valid prefix is copied whole.** The prefix is the record type and two 8-digit numbers (characters 1 to 19). A line inside a work whose type is unknown and whose characters 4 to 19 are not two numbers (a pasted line of free text), and a line of a known type whose transaction or record number is not a number (`SWR0000000X...`, blank, a sign), has no number to write over. Before 0.3.1 its characters 4 to 19 were overwritten with new numbers and the bodies guardrail, which looks from character 20, did not see it. Now such a line is copied exactly as it is, **keeps its place in the count** (the records around it are numbered by their position in the work, as they always were) and the bodies guardrail compares it whole. This holds for a transaction header too. A record shorter than 19 characters is still refused (`unnumberable-record`). A line of an unknown type with a valid prefix (`XYZ0000000000000099...`) is numbered like any other.

**Records outside any transaction are reported.** They are the records before the first group, between groups (after a group trailer), after the file trailer, a second file header, and a detail record between a group header and the first transaction header. None is copied (that has not changed). `stats.outsideRecords` is how many the source has, and `stats.outsideLines` the first 10 as 0-based source lines, so a page can say "3 records outside any transaction were not copied". Both are 0 and `[]` for a clean file.

**A record numbered for another transaction is refused.** If a chosen record's own Transaction Sequence # (characters 4 to 11) is not the number of the transaction header it sits in, extraction would move it into that transaction and renumber it, and the new file would check clean while the source check reports the record (`PFX-4`). The structure guardrail now fails on it and names the source line and both numbers: `Source line 6: this SWR record has Transaction Sequence # 1 but sits in transaction 0.` The result is `guardrail` with `error.cause === 'file'` and `checks.structure.ok === false`; `verifyExtraction` reports it too, so a host that re-checks a download made earlier is told. Only records of chosen transactions count, and a header or record whose own number is not a number is left to the rule above. A transaction whose records agree with their header is renumbered however wrong the numbers are (starting at 5, say): no record names another transaction.

**A file that mixes text encodings is refused.** The guardrails parse the new file again with the encoding detected from its own bytes, the way a receiver (and the page) opens it. Nearly always that is the source's encoding, and nothing changes. It is not when a Latin-1 source gets its encoding from a stray byte (a lone `0xE9`, say) in a work that is not chosen: the new file has no such byte, so a chosen work whose bytes are valid UTF-8 (`0xC3 0xA9`, two characters in the source's reading) is read as UTF-8 in the new file, its title is one column narrower, and the new file checks with errors (`LKP-TBL`, `NWR-F-018`, `FMT-D`) that the source did not have on that work. Before 0.3.1 the bodies guardrail blocked this with a message that blamed the tool. Now, when the encoding the new file shows is not the source's and a copied record differs in that reading, extraction returns `encoding-differs` with `cause: 'file'` and `lines`, the source lines (0-based) of every record that would be read differently, the file header included. It does not refuse when both readings agree: a work with no accented letter (the new file is ASCII), a work that holds the stray byte (the new file is Latin-1 like the source), a UTF-8 file, a file with a byte order mark. A pure-ASCII work from a Latin-1 file extracts and its bytes are the source's. `result.doc` is the new file opened on its own, so its `encoding` is the one a receiver would detect.

**Line endings: `eol`.** `eol: 'keep'` (the default) writes one ending for the whole output, the first one the source uses (CR LF when it has none). `eol: 'crlf'` writes CR LF for every line. In both modes a missing final line ending stays missing. The ending is chosen while the file is built, **so the bytes the guardrails check are the bytes that are returned**: a host that wants CR LF asks for it here and saves `bytes` as they are. Converting the endings afterwards (for example with `serialize(result.doc, { eol: 'crlf' })`) gives the same bytes, but nothing would have checked them. The same holds for the document in the result: `result.doc` is the very document the guardrails looked at, parsed from `result.bytes`. The output differs between the two modes in line endings and nowhere else (a test compares them for CR LF, LF, mixed and lone-CR sources, with and without a byte order mark, Latin-1 and UTF-8 names, lower-case text and a missing final ending).

**An ACK and the EXC that continues it are refused.** An EXC that follows an ACK's work has the ACK's transaction number, so by its number the pair is one transaction. The engine's group and file counts (`GRT-F-002`, `TRL-F-002`, `renumber`) count that EXC as a transaction of its own, so a file with one ACK, its work and its EXC has transaction numbers 0, 0, 0 and a count of 2. The specification says that the EXC carries the ACK's number and does not say which count a receiver wants, and no sample in this repo has the pair, so this tool does not guess: choosing the EXC, or the ACK it continues (choosing one brought the other before), returns `ack-continuation`, `error.refs` names the EXC header, and no file is written. An ACK that carries a work and has no EXC is extracted as always, and so is every other transaction of the same file. The output the tool used to write for the pair was consistent under the engine's own check (the numbers followed the continuation rule and the counts followed `GRT-F-002`); it is refused because that check may not agree with a receiver, not because the file failed it. `addedToSelection` is therefore always empty in a result.

`ExtractSuccess` is `{ ok: true, bytes, doc, stats, selected, addedToSelection, headerChanged, checks }`, where `doc` is the output parsed again and `stats` is `{ groups, transactions, records, droppedGroups, outsideRecords, outsideLines }`. `ExtractFailure` is `{ ok: false, error, checks? }`.

Error codes, and `error.cause`, the likely cause (`'file'` or `'tool'`; absent reads as `'tool'`, and a `guardrail` failure always carries it):

| Code | When | `cause` | Also on the error |
|---|---|---|---|
| `empty-selection` | nothing is selected | tool | |
| `not-a-transaction` | a selected record is not a transaction header | tool | `refs` |
| `no-header` | the file has no header record | file | |
| `encoding-differs` | the file mixes text encodings: opened on its own, the new file reads a copied record as other text (above). Found after the guardrails have read the new file back, so the run has reported progress. | file | `lines` (every source line affected) |
| `short-header` | `keepHeader` is off and the header record ends before its transmission date, so new dates cannot be written (before 0.3.1 the bodies guardrail blocked this with a message that blamed the tool). With `keepHeader` the header is copied as it is. | file | `lines` (the header line) |
| `ack-continuation` | the selection holds an ACK with the EXC that continues it | tool | `refs` (the EXC headers) |
| `unnumberable-record` | a chosen record is shorter than the 19-character prefix | file | `lines` |
| `count-overflow` | a count does not fit its field | tool | |
| `not-encodable` | a pending edit cannot be written in the source's encoding | tool | |
| `guardrail` | a guardrail failed; the details are in `checks` | `file` when every problem found is in the source (the record numbered for another transaction), else `tool` | `checks` |

`short-header`, `ack-continuation`, `no-header` and `unnumberable-record` are found before the new file is built, so a run returns them from the first `next()` with no progress report. The message of a `guardrail` failure is the same for both causes (a check failed, no file was produced, see `checks`); `error.cause` says whether the file or the tool is the likely reason.

**Three guardrails run before anything is returned.** If one fails the result is `guardrail` and there is no file.

1. **Reparse.** The output is parsed again. It must start with a file header and end with a file trailer, hold no stray record, have the groups and transactions that were asked for, and have exactly the expected record types in the expected order.
2. **Structure.** The structure rules are run on the reparsed output and on the source: file framing, group and file counts, sequence numbers, the order of records inside a work, the record types a transaction may hold (`EXTRACT_STRUCTURE_RULES` lists the rule ids). The framing and numbering rules must find nothing in the output, because the tool wrote those parts. The rules that look inside a transaction must report, for the chosen transactions, the same findings the source has, at the matching record and span. A finding that appears in the output without being in the source blocks the file, and so does a finding of the source that vanished. A rule that relates groups to each other may find less in the output than in the source, not more. A chosen record numbered for another transaction than the one it sits in blocks the file as well (above).
3. **Bodies.** Every copied record must equal its source from character 20 on, and have the same record type; a record with no valid prefix must equal its source whole. The text is decoded without loss, so equal text is equal bytes, and the new file is opened on its own, with its encoding detected from its own bytes. The file header may differ only in its two dates and its time, and the group and file trailers only in their ids and counts.

`verifyExtraction` runs the same three on any bytes, for a host that wants to re-check a download. It never throws on a bad output: each way it can be wrong is a problem in the result, at most 20 per guardrail with a count of the rest in `more`. When the output does not line up with the selection, the second and third guardrails report that they could not compare.

Extracting every transaction with `keepHeader` from a well-formed file writes the file again, byte for byte (with `eol: 'crlf'`, the file again with CR LF endings).

**The output is read back once.** The guardrails parse the output a single time and the result returns that parse as `doc`; before 0.3.1 the output was parsed twice, which was a large part of the time for a big file.

## Owned-share calculator

```ts
ownedShares(doc): { works: WorkOwnedShares[] }
```

Read-only. For each work (NWR, REV, ISW and EXC transactions):

- `owned`: per right (`pr`, `mr`, `sr`), what the controlled parties (SPU, SWR) own, what the others (OPU, OWR) own, and the total.
- `controlledParties`: those parties with their ownership shares, from `workSummary`.
- `collected`: per territory, what the controlled parties collect (from SPT and SWT records; OPT and OWT belong to other parties), and `gap`, owned minus collected. A gap can be negative.

Shares are hundredths of a percent (`5000` is 50.00%; `formatShare` makes text). A share that cannot be read is `null`, and so is every total and gap built on it.

Territories are points, as in the checker's share rules: each country a record names, and the World record (`world: true`, code `2136`), which stands for every territory no other record names. World is never expanded into countries. **A territory record that names a group of countries other than World cannot be worked out per country.** The work is then reported with `collected.expanded === false`, the group codes in `collected.unexpanded` and an empty `territories` list; its owned shares are still given.

## Works information as CSV

```ts
worksCsv(doc): Uint8Array
WORKS_CSV_HEADERS: readonly string[]
guardCsvCell(value): string
```

One row per work, for a spreadsheet. A row is made for every NWR, REV, ISW and EXC transaction, and for every ACK transaction: when the ACK carries a work, the work supplies the writers, publishers and shares.

Columns: `Line` (1-based), `Record type`, `Title`, `Submitter work #`, `ISWC`, `Writers` (`LAST, FIRST`), `Publishers`, `PR total %`, `MR total %`, `SR total %` (writers plus publishers, two decimals, empty when a share cannot be read), `ACK status`, `Messages`, `Society work #s` (`society:number`), `Recipient work #`, `Cross-references` (`organisation:identifier`). Several values in one cell are joined with `; `.

The output is UTF-8 with a byte order mark, so Excel reads accented names correctly, with CR LF between rows. Cells are quoted only when they hold a comma, a quote or a line break.

**Formula guard.** A cell that begins with `=`, `+`, `-` or `@`, or with a tab or a carriage return, gets a single quote in front, so opening the file in a spreadsheet cannot run anything. The guard applies to every cell, numbers included.

## Progress and stopping

```ts
extractWorksSteps(doc, selection, options?): Generator<Progress, ExtractResult, void>
worksCsvSteps(doc, options?): Generator<Progress, Uint8Array, void>
ownedSharesSteps(doc, options?): Generator<Progress, OwnedSharesReport, void>
findDuplicatesSteps(doc, options?): Generator<Progress, DuplicateReport, void>
// options: { onProgress?, signal? } (RunOptions, as for checkSteps); extractWorksSteps also takes the options of extractWorks
```

Each is the tool as a generator, shaped like `checkSteps`. It yields a `Progress` between steps and returns what the one-shot function returns; the one-shot function drains the generator, so the two are the same code. A host that has to stay responsive (a worker that must hear a Stop message) calls `next()`, reports the progress, and gives the event loop a turn between calls. **Stopping is not calling `next()` again** (or calling `return()`): the generator holds everything it built, the document is only read, and nothing is left behind, so a stopped run needs no cleanup and the next run starts from the same document. `options.signal` (anything with a boolean `aborted`) is checked at each step, and an aborted signal throws `CancelledError`, as for `check`.

```ts
type Progress = {
  task: 'extract' | 'works-csv' | 'owned-shares' | 'duplicates';   // also 'parse' and 'check'
  stage: string;
  done: number;      // work done in this stage
  total: number;     // work in this stage
  fraction: number;  // 0 to 1 across the whole job; never goes down
};
```

The first report has `fraction` 0 (1 when there is nothing to do, as for an empty document) and the last has `fraction` 1, `done` equal to `total`, and comes just before the result. A request that is refused before the work starts (an empty selection, a record that is not a transaction, no header, a header cut before its dates, an ACK with the EXC that continues it, a record too short to renumber) returns its error from the first `next()` without a report.

| Task | Stages, in order | What `done` and `total` count | Reports |
|---|---|---|---|
| `extract` | `build`, `reparse`, `structure`, `bodies` | `build`: three times the output's records (lines written, lines encoded, bytes joined); `bodies`: the output's records; `reparse` and `structure`: thousandths of the stage, because they wrap the parser and the checker | every 2,048 records, and between the stages |
| `works-csv` | `works`, `rows` | transactions read; rows written | every 256 transactions, every 2,048 rows |
| `owned-shares` | `works` | transactions visited | every 256 transactions |
| `duplicates` | `works`, `groups` | transactions visited; one step | every 256 transactions |

The stage names are for a program; the wording a person reads belongs to the page. For extract they match the guardrails (`reparse`, `structure`, `bodies` are the keys of `ExtractChecks`) and the first stage is the building of the file. Where each stage sits on the bar (`fraction`) is fixed in the code from timings on a 12 MB file: `build` takes the first 30%, `reparse` the next 30%, `structure` up to 93% and `bodies` the rest. These are shares of a typical run, not promises: the structure stage checks the source whichever works are chosen, so a small selection spends most of its time there.

How long a stop can take is the longest stretch between two reports. On a 12 MB, 10,000-work file on a busy host (load average 8 to 12) the longest were 70 to 180 ms for extract and the read-only tools and 170 ms at the very end of the works CSV (encoding the finished text). `parseSteps`, which the extract's read-back runs, now reports while a single-byte file is decoded, a megabyte at a time: the decode used to be one step of 120 to 350 ms for a file of 12 MB.

## Choices where the request was open

| Topic | Choice |
|---|---|
| ISWC with a lower-case `t` | Written with `T`. A field that is not in exactly the written form is not "already valid". |
| ISRC | Only dashes are removed. A value that is not 12 letters and digits afterwards is skipped, not padded. |
| IPI base number without the `I` | The `I` is added when ten digits follow. |
| Find and replace and a refused change | All or nothing with `apply`. A half-applied rename would leave a file inconsistent. |
| Duplicates: a work with no writer | Not grouped by title. |
| `withoutLaterDuplicates` | A work that is a later member of any group is dropped. |
| Extract and line endings | One ending for the whole output: the first the source uses (`eol: 'keep'`, the default) or CR LF (`eol: 'crlf'`), chosen while the file is built so the checked bytes are the returned bytes. |
| Find and replace and `uppercase` | The whole field is written in upper case, and "nothing changed" is decided on that result. |
| Find and replace and `only` | Same meaning as for `cleanIdentifiers`: `record` is the `RecRef`; unknown entries are ignored; an empty list names nothing. |
| Progress units | Counts of records or transactions in the stages that loop over them; thousandths in the two extract stages that wrap the parser and the checker. |
| Extract and a short record | Blocked (`unnumberable-record`) rather than padded. |
| Extract and a record numbered for another transaction | Refused (structure guardrail, `cause: 'file'`): renumbering would hide what the source check reports. A header and its records that agree among themselves are renumbered whatever the numbers. |
| Extract and a line with no valid prefix | Copied whole, keeps its place in the record count, compared whole by the bodies guardrail. |
| Extract and records outside any transaction | Still not copied; counted in `stats.outsideRecords`, first 10 lines in `stats.outsideLines`. |
| Extract and an EXC that continues an ACK | Refused (`ack-continuation`): what the counts should be for the pair is not settled. |
| Extract and a header cut before its dates | Refused (`short-header`, `cause: 'file'`) unless `keepHeader` is set. |
| Extract and the encoding of the output | The output is opened on its own, its encoding detected from its bytes, as a receiver does. If a copied record reads as other text there, the file mixes encodings and extraction is refused (`encoding-differs`, `cause: 'file'`). |
| Find and replace and upper case across scripts | Refused as `uppercase-script`, like an `overflow`. |
| Find and replace and overlapping specs | A field is edited once however many specs name it. |
| CSV guard characters | The four named ones, plus tab and carriage return. |
