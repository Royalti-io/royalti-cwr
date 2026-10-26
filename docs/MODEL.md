# Model notes

Where the shape of the model was open, the simplest reading was taken. Each choice is here so a reviewer can overrule it.

## Shape

`parse(bytes, options?)` returns a `CwrDoc`: `bytes` (kept by reference, never mutated), `encoding`, `bom`, `lines[]` (every physical line with its own end of line), `records[]` (one per non-blank line), `recordOfLine`, `version`, `file { hdr, trl, groups[] }`, `orphans[]`, `edits` and `layouts`. A `RecRef` is an index into `records`. Field values are never copied: `getField(doc, ref, name)` slices the line on demand, and `fieldSpan` gives the exact character span for an underline.

`serialize(doc)` copies untouched lines straight from `bytes`, so an unedited model is identical to its input. `setField` rewrites one field's characters in `doc.edits`; `renumber` recomputes the counts of the group and file trailers.

## Choices made

| Topic | Choice |
|---|---|
| `Line.byteEnd` | Includes the end of line. Lines tile the file after the BOM with no gap. |
| Empty input, final newline | An empty file has no lines. A final newline does not create an empty last line. |
| Blank line | Only spaces and tabs (or nothing). A line that starts with three blanks but has content is a record of type `'   '`, which is unknown. |
| Lone CR | Counts as a line ending. CR LF is one ending. |
| BOM | Forces `utf8` when the rest is valid. A BOM followed by invalid UTF-8 is read as Latin-1 so no byte is replaced; `bom` stays true. |
| Encoding | ASCII, then strictly valid UTF-8 (no overlongs or surrogates), else Latin-1 through a hand-written byte-to-U+00xx map. No `TextDecoder`. Columns are UTF-16 code units, so an astral character counts as two. |
| `Rec.status` precedence | `unknown-type`, then `bad-prefix`, then `long`/`short`, else `ok`. It is one value, so a short record with a broken prefix shows `bad-prefix`. |
| Known type without a layout | `status 'ok'`, `layout null`. `LayoutProvider.isRecordType` tells a valid type from an unknown one. |
| Prefix check | Characters 4-11 and 12-19 must be digits, for every type except HDR, GRH, GRT, TRL. `tseq`/`rseq` are set only when both parse. |
| Version | From the first GRH (`02.20` is 2.2, any other `02.xx` is 2.1), else the HDR version field (`2.2`), else 2.1 with `source: 'default'`. `options.version` forces it. Later GRHs are not compared. |
| CWR 3.x | `UnsupportedVersionError` before parsing, from the GRH (`03.`), an HDR version field (`3.`) or a `.V3x` name passed as `options.fileName`. |
| Size cap | `InputTooLargeError` over 50 MB (`options.maxBytes`). |
| Grouping | By position. The first HDR is `file.hdr`; the first TRL is `file.trl` and closes the open group; later HDR/TRL, a GRT with no open group, any transaction header outside a group and any detail record outside a transaction go to `orphans`. A GRH with no GRT is closed by the next GRH or the TRL. |
| `Txn.records` | Detail records after the header, not the header itself (the header is `Txn.header`). |
| ACK | A non-ACK header straight after an ACK header continues that transaction (`inner[0]`). The inner header and its details are also in the ACK's `records`. MSG records stay in place. |
| `setField` | Mutates `doc.edits` in place; `forkDoc` gives a copy for undo. Numeric (N, D, T): digits only, zero-filled, leading zeros stripped to fit, never truncated. Others: space-padded, refused on overflow unless `overflow: 'truncate'`, line breaks refused, upper-casing optional. A character the file's encoding cannot hold is refused. A short record is padded with blanks up to the field, the only case where line length changes. |
| `Rec` after an edit | `Rec.length` and `status` describe the parsed input and are not refreshed by `setField`. Re-parse `serialize(doc)` for fresh facts. |
| `renumber` | Group trailer: transactions in the group and records from GRH to GRT inclusive. File trailer: groups, transactions (ACK-carried transactions not double counted) and records from HDR to TRL inclusive. A missing GRT or TRL is not created. |
| `serialize` `eol: 'crlf'` | Rewrites every present ending as CR LF and keeps a missing final newline. |

## Layouts

`specLayouts`, the default `LayoutProvider`, reads the generated field tables in `src/spec`: aliases resolve (REV, ISW and EXC to NWR; OPU to SPU; OWR to SWR; OPT and OWT in 2.2), aggregate rows are skipped (they repeat their children), and the 1-based `start`/`size` become 0-based `start`/`end`. A layout object is built once per version and key. `isRecordType` is true for 39 record types in 2.1 and 42 in 2.2.

Field ids are camelCase forms of the field names (`prOwnershipShare`, `writerLastName`, `tisNumericCode`). The ids that library code names live in `src/model/fieldRefs.ts`; a test checks each against both versions.

## Synthetic data

`src/synth/generate.ts` writes only invented content: fictional surnames and plain first names, made-up publisher names, titles of the form `AMBER HARBOUR 00001`, work numbers `SYN000001`, and IPI name numbers on the base `9990000nn` with valid check digits. Defaults: CR LF and a final newline; options give LF and no final newline. Shares total 100% per right, with non-controlled parties (OPU/OWR) when `otherParties` is set. `.gitattributes` marks `test/fixtures/**` as `-text` so git never rewrites the line endings the round-trip tests compare byte for byte.
