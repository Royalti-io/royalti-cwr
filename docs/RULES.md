# Rules

The 172 rules of `BUILTIN_RULES`, one row each: id, severity, scope, versions, a short title, and the document the rule rests on (see [SOURCES.md](SOURCES.md)).
142 are errors, 27 warnings and 3 notes. A field-edit table of 36 fields makes some field problems warnings instead of errors.

The package carries the rule, not the specification text behind it: read the cited document for the wording. A rule id that looks like a CISAC key (`NWR-T-011`) is that key.

| Id | Severity | Scope | Versions | Title | Source |
|---|---|---|---|---|---|
| `ENC-001` | warning | file | 2.1, 2.2 | Records end with CR/LF | `cisac/cwr-functional-spec-2-1` |
| `ENC-002` | error | file | 2.1, 2.2 | ASCII unless the HDR names a character set | `cisac/cwr-functional-spec-2-1` |
| `ENC-003` | info | file | 2.1, 2.2 | Blank line | `cisac/cwr-functional-spec-2-1` |
| `ENC-004` | error | file | 2.1, 2.2 | No NUL characters | `cisac/cwr-functional-spec-2-1` |
| `STR-F-001` | error | record | 2.1, 2.2 | Record type valid for the version | `cisac/cwr-functional-spec-2-1` |
| `HDR-1` | error | file | 2.1, 2.2 | First record is HDR | `cisac/cwr-functional-spec-2-1` |
| `HDR-2` | error | file | 2.1, 2.2 | Second record is GRH | `cisac/cwr-functional-spec-2-1` |
| `TRL-1` | error | file | 2.1, 2.2 | Last record is TRL | `cisac/cwr-functional-spec-2-1` |
| `FILE-4` | error | group | 2.1, 2.2 | Every GRH after the first follows a GRT | `cisac/cwr-functional-spec-2-1` |
| `FILE-6` | error | group | 2.1, 2.2 | GRH followed by a transaction header | `cisac/cwr-functional-spec-2-1` |
| `FILE-7` | error | group | 2.1, 2.2 | GRT followed by GRH or TRL | `cisac/cwr-functional-spec-2-1` |
| `FILE-8` | error | file | 2.1, 2.2 | One HDR and one TRL | `cisac/cwr-functional-spec-2-1` |
| `GRH-F-002` | error | group | 2.1, 2.2 | Group IDs start at 1 and rise by 1 | `cisac/cwr-functional-spec-2-1` |
| `GRH-F-005` | error | group | 2.1, 2.2 | Each transaction type once per file | `cisac/cwr-functional-spec-2-1` |
| `GRT-F-001` | error | group | 2.1, 2.2 | GRT Group ID equals the GRH Group ID | `cisac/cwr-functional-spec-2-1` |
| `GRT-F-002` | error | group | 2.1, 2.2 | GRT transaction count | `cisac/cwr-functional-spec-2-1` |
| `GRT-F-003` | error | group | 2.1, 2.2 | GRT record count | `cisac/cwr-functional-spec-2-1` |
| `TRL-F-001` | error | file | 2.1, 2.2 | TRL group count | `cisac/cwr-functional-spec-2-1` |
| `TRL-F-002` | error | file | 2.1, 2.2 | TRL transaction count | `cisac/cwr-functional-spec-2-1` |
| `TRL-F-003` | error | file | 2.1, 2.2 | TRL record count | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-022` | error | transaction | 2.1, 2.2 | Transaction type equals the GRH type | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-008` | error | record | 2.1, 2.2 | Detail record allowed in this transaction | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-012` | error | transaction | 2.1, 2.2 | At least one writer record | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-018` | error | transaction | 2.1 | Record order inside a work | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-043` | error | transaction | 2.2 | Record order inside a work | `cisac/cwr-functional-spec-2-2` |
| `EWT-R-001` | error | transaction | 2.1, 2.2 | One EWT per work | `cisac/cwr-functional-spec-2-1` |
| `VER-R-001` | error | transaction | 2.1, 2.2 | One VER per work | `cisac/cwr-functional-spec-2-1` |
| `IND-R-001` | error | record | 2.1, 2.2 | IND follows an INS or IND | `cisac/cwr-functional-spec-2-1` |
| `COM-R-001` | error | record | 2.1, 2.2 | COM only on a composite work | `cisac/cwr-functional-spec-2-1` |
| `ACK-T-002` | error | transaction | 2.1, 2.2 | ACK followed by NWR, REV or AGR | `cisac/cwr-functional-spec-2-1` |
| `ACK-T-003` | error | transaction | 2.1, 2.2 | EXC follows an NWR or REV inside an ACK | `cisac/cwr-functional-spec-2-1` |
| `AGR-T-002` | error | transaction | 2.1, 2.2 | AGR has a TER record | `cisac/cwr-functional-spec-2-1` |
| `AGR-T-003` | error | transaction | 2.1, 2.2 | AGR has an assignor and an acquirer IPA record | `cisac/cwr-functional-spec-2-1` |
| `PFX-2` | error | record | 2.1, 2.2 | Transaction Sequence # starts at 0 in each group | `cisac/cwr-functional-spec-2-1` |
| `PFX-3` | error | record | 2.1, 2.2 | Transaction Sequence # rises by 1 per transaction | `cisac/cwr-functional-spec-2-1` |
| `PFX-4` | error | record | 2.1, 2.2 | Detail records keep the Transaction Sequence # of the record before | `cisac/cwr-functional-spec-2-1` |
| `PFX-5` | error | record | 2.1, 2.2 | Transaction header has Record Sequence # 0 | `cisac/cwr-functional-spec-2-1` |
| `PFX-6` | error | record | 2.1, 2.2 | Record Sequence # rises by 1 per detail record | `cisac/cwr-functional-spec-2-1` |
| `STR-LEN` | error | record | 2.1, 2.2 | Record length matches the layout | `cisac/cwr-functional-spec-2-1` |
| `FMT-M` | error | field | 2.1, 2.2 | Mandatory field is blank | `cisac/cwr-functional-spec-2-1` |
| `FMT-N` | error | field | 2.1, 2.2 | Numeric field holds digits only | `cisac/cwr-functional-spec-2-1` |
| `FMT-Z` | warning | field | 2.1, 2.2 | Numeric, date or time field with no data holds zeroes | `cisac/cwr-functional-spec-2-1` |
| `FMT-D` | error | field | 2.1, 2.2 | Date is a real YYYYMMDD date | `cisac/cwr-functional-spec-2-1` |
| `FMT-T` | error | field | 2.1, 2.2 | Time or duration is HHMMSS | `cisac/cwr-functional-spec-2-1` |
| `FMT-B` | error | field | 2.1, 2.2 | Boolean field is Y or N | `cisac/cwr-functional-spec-2-1` |
| `FMT-F` | error | field | 2.1, 2.2 | Flag field is Y, N or U | `cisac/cwr-functional-spec-2-1` |
| `FMT-UC` | error | field | 2.1, 2.2 | Alphabetic fields are upper case | `cisac/cwr-functional-spec-2-1` |
| `HDR-F-002` | error | record | 2.1, 2.2 | Sender Type is PB, SO, WR or AA, or two digits | `cisac/cwr-functional-spec-2-1` |
| `HDR-F-009` | error | record | 2.1, 2.2 | EDI Standard Version Number is 01.10 | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-002` | error | record | 2.1, 2.2 | SPU has an Interested Party # | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-004` | error | record | 2.1, 2.2 | Publisher Name is entered | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-005` | error | record | 2.1, 2.2 | SPU has a Publisher Type | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-007` | error | record | 2.1, 2.2 | SPU leaves Publisher Unknown Indicator blank | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-001` | error | record | 2.1, 2.2 | SWR has an Interested Party # | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-003` | error | record | 2.1, 2.2 | Writer Last Name is entered | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-004` | error | record | 2.1, 2.2 | SWR leaves Writer Unknown Indicator blank | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-007` | error | record | 2.1, 2.2 | SWR has a Writer Designation Code | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-007` | error | record | 2.1, 2.2 | SER work has a duration | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-014` | error | record | 2.1, 2.2 | MOD version has a Music Arrangement | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-015` | error | record | 2.1, 2.2 | MOD version has a Lyric Adaptation | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-018` | error | record | 2.1, 2.2 | Composite Type needs a Component Count | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-019` | error | record | 2.1, 2.2 | Component Count needs a Composite Type | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-020` | error | record | 2.1, 2.2 | Component Count is greater than 1 | `cisac/cwr-functional-spec-2-1` |
| `ALT-F-006` | error | record | 2.1, 2.2 | OL and AL titles carry a language | `cisac/cwr-functional-spec-2-1` |
| `ORN-F-004` | error | record | 2.1, 2.2 | LIB origin has a CD Identifier | `cisac/cwr-functional-spec-2-1` |
| `ORN-F-010` | error | record | 2.1, 2.2 | ORN has a Production Title or Library | `cisac/cwr-functional-spec-2-1` |
| `ORN-F-013` | error | record | 2.1, 2.2 | FIL and TEL origins have a Production Title | `cisac/cwr-functional-spec-2-1` |
| `REC-F-001` | error | record | 2.1, 2.2 | REC carries at least one value | `cisac/cwr-functional-spec-2-1` |
| `NPR-F-005` | error | record | 2.1, 2.2 | NPR names an artist, a language or a dialect | `cisac/cwr-functional-spec-2-1` |
| `ARI-R-001` | error | record | 2.1, 2.2 | ARI has a Work # or a Note | `cisac/cwr-functional-spec-2-1` |
| `ACK-F-009` | error | record | 2.1, 2.2 | Creation Title on an ACK for a work | `cisac/cwr-functional-spec-2-1` |
| `LKP-TBL` | error | field | 2.1, 2.2 | Value is in its lookup table | `cisac/cwr-functional-spec-2-1` |
| `LKP-SOC` | warning | field | 2.1, 2.2 | Society code is in a saved society list | `cisac/cwr-functional-spec-2-1` |
| `LKP-TIS` | info | field | 2.1, 2.2 | TIS code is in the saved TIS list | `cisac/cwr-functional-spec-2-1` |
| `LKP-RET` | warning | field | 2.1, 2.2 | Code is not marked as retired | `cisac/cwr-lookup-tables-crf020` |
| `ID-IPI-FMT` | warning | field | 2.1, 2.2 | IPI Name # is 11 digits | `gema/what-which-number` |
| `ID-IPI-CHK` | warning | field | 2.1, 2.2 | IPI Name # check digits (secondary source) | `secondary/ipi-check-digits` |
| `ID-IPIB-FMT` | warning | field | 2.1, 2.2 | IPI Base # is I-NNNNNNNNN-C | `gema/what-which-number` |
| `ID-IPIB-CHK` | warning | field | 2.1, 2.2 | IPI Base # check digit (secondary source) | `secondary/ipi-check-digits` |
| `HDR-F-SENDER-IPI` | warning | record | 2.1, 2.2 | A numeric Sender Type and the Sender ID spell an IPI Name # (secondary source) | `secondary/ipi-check-digits` |
| `NWR-F-004` | warning | field | 2.1, 2.2 | ISWC is T and ten digits | `cisac/cwr-functional-spec-2-1` |
| `EWT-F-002` | warning | field | 2.1, 2.2 | ISWC of Entire Work is T and ten digits | `cisac/cwr-functional-spec-2-1` |
| `VER-F-002` | warning | field | 2.1, 2.2 | ISWC of Original Work is T and ten digits | `cisac/cwr-functional-spec-2-1` |
| `COM-F-002` | warning | field | 2.1, 2.2 | ISWC of Component is T and ten digits | `cisac/cwr-functional-spec-2-1` |
| `REC-F-009` | warning | field | 2.1, 2.2 | EAN is 13 digits | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-004` | error | transaction | 2.1, 2.2 | Publisher ownership totals stay within the limits | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-009` | error | transaction | 2.1, 2.2 | Writer ownership totals stay within the limits | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-011` | error | transaction | 2.1, 2.2 | Each right totals 100% or 0% | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-025` | error | transaction | 2.1, 2.2 | A controlled publisher chain owns something | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-026` | error | transaction | 2.1, 2.2 | An acquirer takes over the original publisher’s ownership | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-013` | error | field | 2.1, 2.2 | Publisher PR ownership share is between 0% and 50% | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-016` | error | field | 2.1, 2.2 | Publisher MR ownership share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-018` | error | field | 2.1, 2.2 | Publisher SR ownership share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-019` | error | transaction | 2.1, 2.2 | Only original publishers and acquirers own shares | `cisac/cwr-functional-spec-2-1` |
| `SPU-R-008` | error | transaction | 2.1, 2.2 | An acquirer has an ownership share | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-011` | error | field | 2.1, 2.2 | Writer PR ownership share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-013` | error | field | 2.1, 2.2 | Writer MR ownership share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-015` | error | field | 2.1, 2.2 | Writer SR ownership share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SPT-F-006` | error | field | 2.1, 2.2 | Publisher PR collection share is between 0% and 50% | `cisac/cwr-functional-spec-2-1` |
| `SPT-F-007` | error | field | 2.1, 2.2 | Publisher MR collection share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SPT-F-008` | error | field | 2.1, 2.2 | Publisher SR collection share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SWT-F-003` | error | field | 2.1, 2.2 | Writer PR collection share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SWT-F-004` | error | field | 2.1, 2.2 | Writer MR collection share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `SWT-F-005` | error | field | 2.1, 2.2 | Writer SR collection share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `IPA-F-006` | error | field | 2.1, 2.2 | Agreement PR share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `IPA-F-008` | error | field | 2.1, 2.2 | Agreement MR share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `IPA-F-010` | error | field | 2.1, 2.2 | Agreement SR share is between 0% and 100% | `cisac/cwr-functional-spec-2-1` |
| `AGR-T-005` | error | transaction | 2.1, 2.2 | Agreement shares total 100% or 0% for each right | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-001` | error | transaction | 2.1, 2.2 | Publisher Sequence # starts at 1 and rises by 1 per chain | `cisac/cwr-functional-spec-2-1` |
| `SPU-R-002` | error | transaction | 2.1, 2.2 | A chain opens with Publisher Type E or PA | `cisac/cwr-functional-spec-2-1` |
| `SPU-R-005` | error | transaction | 2.1, 2.2 | Administrators and sub-publishers carry the chain’s sequence number | `cisac/cwr-functional-spec-2-1` |
| `SPU-D-001` | warning | transaction | 2.1, 2.2 | A linked publisher stands after another chain’s records | `cisac/cwr-functional-spec-2-1` |
| `SPU-R-006` | error | transaction | 2.1 | An OPU chain holds OPU records only | `cisac/cwr-functional-spec-2-1` |
| `SPU-R-007` | error | transaction | 2.1 | No SPT record in an OPU chain | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-016` | error | transaction | 2.1, 2.2 | No OPU in an SPU chain | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-017` | error | transaction | 2.1, 2.2 | One original publisher per chain | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-032` | error | transaction | 2.1, 2.2 | An acquirer follows an original publisher | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-040` | error | transaction | 2.2 | A collecting publisher has an IPI Name # | `cisac/cwr-functional-spec-2-2` |
| `SPU-F-008` | warning | record | 2.1, 2.2 | OPU unknown-publisher flag is Y or N | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-009` | warning | record | 2.1, 2.2 | OPU with Publisher Unknown Indicator Y has no name | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-005` | warning | record | 2.1, 2.2 | OWR unknown-writer flag is Y or N | `cisac/cwr-functional-spec-2-1` |
| `SWR-F-006` | warning | record | 2.1, 2.2 | OWR with Writer Unknown Indicator Y has no last name | `cisac/cwr-functional-spec-2-1` |
| `SPT-F-001` | error | transaction | 2.1, 2.2 | SPT follows an SPU, NPN or SPT | `cisac/cwr-functional-spec-2-1` |
| `SPT-F-014` | error | transaction | 2.2 | OPT only after publisher-chain records | `cisac/cwr-functional-spec-2-2` |
| `SPT-F-002` | error | transaction | 2.1, 2.2 | SPT Interested Party # is the SPU’s | `cisac/cwr-functional-spec-2-1` |
| `SPT-F-013` | error | transaction | 2.1, 2.2 | SPT Sequence # counts from 1 under each SPU | `cisac/cwr-functional-spec-2-1` |
| `SWT-F-001` | error | transaction | 2.1, 2.2 | SWT follows an SWR, NWN or SWT | `cisac/cwr-functional-spec-2-1` |
| `SWT-F-011` | error | transaction | 2.2 | OWT follows an OWR, NWN or OWT | `cisac/cwr-functional-spec-2-2` |
| `SWT-F-002` | error | transaction | 2.1, 2.2 | SWT Interested Party # is the SWR’s | `cisac/cwr-functional-spec-2-1` |
| `SWT-F-013` | error | transaction | 2.2 | OWT Interested Party # is the OWR’s | `cisac/cwr-functional-spec-2-2` |
| `SWT-F-010` | error | transaction | 2.1, 2.2 | SWT Sequence # counts from 1 under each SWR | `cisac/cwr-functional-spec-2-1` |
| `NPN-R-001` | error | transaction | 2.1, 2.2 | NPN immediately follows its SPU | `cisac/cwr-functional-spec-2-1` |
| `NPN-F-001` | error | transaction | 2.1, 2.2 | NPN Publisher Sequence # is its SPU’s | `cisac/cwr-functional-spec-2-1` |
| `NPN-F-002` | error | transaction | 2.1, 2.2 | NPN Interested Party # is its SPU’s | `cisac/cwr-functional-spec-2-1` |
| `NWN-R-001` | error | transaction | 2.1, 2.2 | NWN immediately follows its SWR | `cisac/cwr-functional-spec-2-1` |
| `NWN-F-001` | error | transaction | 2.1, 2.2 | NWN Interested Party # is its SWR’s | `cisac/cwr-functional-spec-2-1` |
| `SWR-R-002` | error | transaction | 2.1, 2.2 | A published writer has a PWR link | `cisac/cwr-functional-spec-2-1` |
| `PWR-R-001` | error | transaction | 2.1 | No PWR after an OWR | `cisac/cwr-functional-spec-2-1` |
| `PWR-R-002` | error | transaction | 2.1 | PWR follows an SWR, SWT or PWR | `cisac/cwr-functional-spec-2-1` |
| `PWR-F-001` | error | transaction | 2.1 | PWR Publisher IP # is an earlier original publisher | `cisac/cwr-functional-spec-2-1` |
| `PWR-F-005` | error | transaction | 2.1 | PWR Writer IP # is the preceding SWR’s | `cisac/cwr-functional-spec-2-1` |
| `PWR-F-007` | error | transaction | 2.2 | PWR Publisher Sequence # names a publisher chain | `cisac/cwr-functional-spec-2-2` |
| `PWR-F-008` | error | transaction | 2.2 | A PWR after an SWR has a Writer IP # | `cisac/cwr-functional-spec-2-2` |
| `PWR-F-009` | error | transaction | 2.2 | A PWR after an SWR has a Publisher IP # | `cisac/cwr-functional-spec-2-2` |
| `PWR-F-010` | error | transaction | 2.2 | A PWR after an SWR has a Publisher Name | `cisac/cwr-functional-spec-2-2` |
| `PWR-F-011` | error | transaction | 2.2 | PWR Writer IP # is the preceding writer’s | `cisac/cwr-functional-spec-2-2` |
| `PWR-F-012` | error | transaction | 2.2 | PWR Publisher IP # is the named chain’s publisher | `cisac/cwr-functional-spec-2-2` |
| `NWR-T-014` | error | transaction | 2.1 | Collection shares per territory do not exceed 100% | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-044` | error | transaction | 2.2 | Collection shares per territory do not exceed 100% | `cisac/cwr-functional-spec-2-2` |
| `NWR-T-027` | error | transaction | 2.1, 2.2 | PR collection in a territory equals the chain’s PR ownership | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-007` | warning | transaction | 2.1, 2.2 | A controlled publisher chain with ownership has an SPT | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-020` | warning | transaction | 2.1, 2.2 | A controlled writer with ownership has an SWT | `cisac/cwr-functional-spec-2-1` |
| `SPT-R-001` | warning | record | 2.1, 2.2 | An included publisher territory has a share above zero | `cisac/cwr-functional-spec-2-1` |
| `SWT-R-001` | error | record | 2.1, 2.2 | An included writer territory has a share above zero | `cisac/cwr-functional-spec-2-1` |
| `SWT-R-003` | warning | record | 2.1, 2.2 | An excluded writer territory has zero shares | `cisac/cwr-functional-spec-2-1` |
| `SPT-D-001` | warning | record | 2.1, 2.2 | An excluded publisher territory should have zero shares | `cisac/cwr-functional-spec-2-1` |
| `TIS-GRP` | info | field | 2.1, 2.2 | A territory group other than World is not expanded | `cisac/cwr-functional-spec-2-1` |
| `GRH-F-004` | error | group | 2.1, 2.2 | GRH Version Number is 02.10 (2.1) or 02.20 (2.2) | `cisac/cwr-functional-spec-2-1` |
| `HDR-F-015` | error | record | 2.2 | HDR Version, when entered, is 2.2 | `cisac/cwr-functional-spec-2-2` |
| `HDR-F-016` | error | record | 2.2 | HDR Revision, when entered, is 1 or 2 | `cisac/cwr-functional-spec-2-2` |
| `VER-002` | warning | file | 2.1, 2.2 | The file holds content from the other CWR version | `cisac/cwr-functional-spec-2-2` |
| `VER-005` | warning | record | 2.2 | ORN characters 163 to 187 are blank in 2.2 | `cisac/cwr-functional-spec-2-2` |
| `XRF-F-002` | warning | field | 2.2 | XRF Identifier Type is W, R or P | `cisac/cwr-functional-spec-2-2` |
| `NWR-T-003` | error | transaction | 2.1 | A SER work has an INS record | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-053` | error | transaction | 2.2 | A SER work has an INS or IND record | `cisac/cwr-functional-spec-2-2` |
| `NWR-T-010` | error | transaction | 2.1, 2.2 | A modification has an arranger, adapter, sub-arranger, sub-author or translator | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-015` | error | transaction | 2.1, 2.2 | A work has a creator writer | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-023` | error | transaction | 2.1, 2.2 | An original work has no arranger, adapter, sub-arranger, sub-author or translator | `cisac/cwr-functional-spec-2-1` |
| `NWR-T-045` | error | transaction | 2.2 | A music-only work has no text writers | `cisac/cwr-functional-spec-2-2` |
| `SWR-F-020` | error | transaction | 2.1, 2.2 | In a modification a creator with no share is matched by an arranger who has one | `cisac/cwr-functional-spec-2-1` |
| `SPU-F-029` | error | record | 2.1, 2.2 | A publisher named like a society has an IPI Name # | `cisac/cwr-functional-spec-2-1` |
| `NWR-F-003` | error | file | 2.1, 2.2 | A Submitter Work # is used once in the file | `cisac/cwr-functional-spec-2-1` |
