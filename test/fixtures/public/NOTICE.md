# Public sample

`CW190001MPC_000.V21` is a CWR 2.1 test file from <https://github.com/musicmetadata/edi>
(MIT licence, copyright 2019 Matija Kolaric; the licence text is `LICENSE` in this folder).

- Upstream path: `music_metadata/edi/tests/CW190001MPC_000.V21`.
- Provenance check, 2026-10-26: the file here has git blob id `cc09a478e99b03a01b9050a1ff12a5f41fdd012d` (229,647 bytes), the same
  as the file at that path on the upstream default branch. The last upstream commit that changed the path is
  `e93be6edb05df124473651f3f614ba8923d9f387` (2020-09-16, "improved testing and minor tweaks."), so the content is the same at that commit
  and at every later one. The exact commit it was copied from was not recorded.

It is a validator's test file with defects planted in it (a line of blanks, an `ALX` record,
short records). It is used here as the "malformed input is kept" fixture, not as a clean file.
