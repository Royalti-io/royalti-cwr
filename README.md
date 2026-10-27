# @royalti/cwr

Parse, check, edit and write CWR 2.1 and 2.2 files. TypeScript, no dependencies, no I/O: bytes in, bytes out.

- **Parse** a file into a model that keeps every byte, damaged lines included.
- **Check** it against 172 rules. Each problem names the line, the exact characters, a plain message and the rule id.
- **Edit** single fields and **serialize** the file again. A file you did not edit comes back byte for byte.
- **Fix tools** on top of that: clean identifiers, find and replace in titles and names, flag duplicate works, extract chosen works into a new file, work out owned shares, and write a works list as CSV. See [docs/TOOLS.md](https://github.com/Royalti-io/royalti-cwr/blob/main/docs/TOOLS.md).

It runs in Node, in a browser and in a web worker. It is the engine behind the Royalti CWR checker.

## Install

```sh
npm install @royalti/cwr
```

## Use

```ts
import { readFileSync } from 'node:fs';
import { parse, check, serialize } from '@royalti/cwr';

// Any Uint8Array. In a browser: new Uint8Array(await file.arrayBuffer()).
const bytes = new Uint8Array(readFileSync('works.V21'));

const doc = parse(bytes);            // keeps malformed lines and reports them; throws only for a CWR 3.x file or input over 50 MB
const result = check(doc);

console.log(result.summary.text);    // "No problems found in 1,531 checks" or "516 problems in 64,107 checks: 24 errors, 492 warnings"
for (const p of result.problems) {
  console.log(`${p.severity} ${p.ruleId} line ${p.line + 1}: ${p.message}`);
}

const same = serialize(doc);         // the original bytes, unless you edited the document
```

`parse` reads CWR 2.1 and 2.2 and detects the version. `check` runs every rule that applies to it. `serialize` writes the file back; `setField` and `renumber` change a field and the group and file counts. The fix tools (`cleanIdentifiers`, `findReplace`, `findDuplicates`, `extractWorks`, `ownedShares`, `worksCsv`) are described in [docs/TOOLS.md](https://github.com/Royalti-io/royalti-cwr/blob/main/docs/TOOLS.md). The rest of the API (field information, per-work share summaries, progress and cancel, sniffing a file before parsing) is in [docs/API.md](https://github.com/Royalti-io/royalti-cwr/blob/main/docs/API.md).

### What a result means

The package never calls a file "valid". It reports the problems it found in the checks it ran. The summary text is `No problems found in N checks` or `P problems in N checks: E errors, W warnings` (`1 problem`, `1 error` and `1 warning` in the singular); the test sample in this repository gives `516 problems in 64,107 checks: 24 errors, 492 warnings`, and a clean generated file gives `No problems found in 1,531 checks`. **A clean result is not a registration.** Societies apply their own rules, and the checks that need a society or CISAC database (IPI lookups, agreements on file) are not run.

## Entry points

| Import | What it is |
|---|---|
| `@royalti/cwr` | The full API. |
| `@royalti/cwr/lite` | The same API without `lookupLabel` and `lookupRow`. It stays a separate entry so a page can keep importing it in a worker. |
| `@royalti/cwr/reference` | Which document each rule and field rests on: titles, addresses and editions of the cited documents. |

## No I/O

The engine reads no file, makes no request and writes nothing. Input is a `Uint8Array`, output is data or a `Uint8Array`.

- It has no dependencies.
- `eslint.config.js` bans `node:*` imports and the globals `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `navigator`, `eval`, `Function`, `EventSource`, `sendBeacon`, `process`, `require` and `Buffer` in `src/`, and `npm run lint` fails on any of them.
- `tsconfig.json` compiles with no Node and no DOM types, so `src/` cannot use `window` or `fs`.
- A test in this repository scans `src/` for the same calls.

## The specifications

The rules implement the CWR 2.1 and CWR 2.2 specifications that CISAC publishes. **This package contains no passages or quotations from those specifications**, from CISAC's lookup tables or from its error messages. It does use CISAC's names as identifiers, because the format cannot be read or written without them: field names and positions, society short names (one rule compares a publisher name to them) and lookup codes. Rule messages are written in our own words.

Each rule, field and table is tied to the document it rests on by a slug. `@royalti/cwr/reference` gives the title, address and edition of each document, and the GitHub repository lists them in [docs/SOURCES.md](https://github.com/Royalti-io/royalti-cwr/blob/main/docs/SOURCES.md) and every rule with its source in [docs/RULES.md](https://github.com/Royalti-io/royalti-cwr/blob/main/docs/RULES.md). Read the cited document for the specification's wording; CISAC publishes the CWR documents to its members. What the package keeps and leaves out is in [docs/SPECIFICATION-TEXT.md](https://github.com/Royalti-io/royalti-cwr/blob/main/docs/SPECIFICATION-TEXT.md).

The `docs/` folder is in the GitHub repository. The npm package contains only `dist/`, `LICENSE`, `package.json` and this README.

This project is not affiliated with, endorsed by or sponsored by CISAC. CISAC and CWR are names used here only to say which format the package reads.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`test/fixtures/public/` holds a CWR 2.1 test file from <https://github.com/musicmetadata/edi> (MIT licence, copyright 2019 Matija Kolaric; its licence and provenance are in that folder). The other fixtures are generated from invented data.

## Licence

MIT. See [LICENSE](LICENSE).
