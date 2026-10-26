# Specification text: what this package keeps and leaves out

The rules in this package implement the CWR 2.1 and CWR 2.2 specifications that CISAC publishes. The package contains no passages or quotations from those documents, from CISAC's lookup tables or from its error messages. It does use CISAC's names as identifiers: field names, society short names and lookup codes.

## What is in

- the rules: id, severity, scope, versions, a short title, and a message written in our own words;
- field names and positions (`spec/fields.2-1.tsv`, `spec/fields.2-2.tsv`): record, field id, name (CISAC's field name), start, size, format, requirement;
- lookup codes with their scope (which document the table comes from) and status (retired, historic, ...);
- rule ids, including CISAC's own keys where a rule maps to one (`NWR-T-011`);
- the title, address and edition of each cited document (`docs/SOURCES.md`, `SOURCES` in `@royalti/cwr/reference`).

## What is out

| Out | Instead |
|---|---|
| Quotations from the specifications behind each rule, field and edit | `source.quote` is the empty string; `source.slug` names the document |
| Notes on ambiguous spec text | none |
| Lookup descriptions and details (what a code means, countries, dates) | `description` is empty and `detail` is absent, with two exceptions below |
| Message wording that follows a specification sentence | rewritten as a plain statement of what is wrong |

## Three kinds of lookup text that stay

- **Society names** (`societyCode`): the short name of each society (`ASCAP`, `PRS`, ...). One rule compares a publisher name to these names. They are names of organisations, not description text, but they come from CISAC's table.
- **TIS flags** (`tis`): `type GROUP;` marks a territory code that stands for a group, and `TIS-A xx;` gives a country's two-letter code. The territory rules read exactly these.
- **`World`**: the name of TIS code 2136, which the territory rules treat specially.

## Reading the specification

Each rule cites its document by slug. `docs/SOURCES.md` lists the documents with their editions and addresses. CISAC publishes the CWR documents through its member portal, so some addresses open only for a logged-in CISAC member.

## Checking this claim

The repository this package comes from runs a leak test before every release: it fails if any run of eight consecutive words of a CISAC document, or any quotation held in the private development copy, occurs anywhere in the package, its documentation, its tests or its built files.
