# backportcheck — Build Report

MCP Rebuild 1000, Batch 17. Original program build from the
packages-100 plan (cluster A #10), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch17/backportcheck.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `backportcheck`, npm `@reneturcios/backportcheck`,
MCP name `io.github.CloudCorpRecords/backportcheck`, version
`0.1.0`, bin `backportcheck` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Decide whether
  a fix needs a backport, and to which release branches."
  — 69 chars, verified by count; npm entry carries
  `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/backportcheck:0.1.0` carries
  **no** `version` field), `Dockerfile` (node:20-alpine
  two-stage, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/backportcheck"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`check --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/backportcheck.ts` (core,
  `VERSION = "0.1.0"`, also exporting the pinned
  `compareVersions`)
- `test/backportcheck.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/backportcheck`,
  smoke-test server-name assertion `backportcheck`)

Plus the parity fixture at
`harness/fixtures/backportcheck-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster A #10.

## Tools implemented (1)

- `check_backport` — arguments: `fix_version` (string,
  required, x.y.z), `severity` (string, required, enum
  ["critical", "major", "minor"]), `branches` (array,
  required, non-empty; each entry an object with `name`
  string required non-empty, `version` string required
  x.y.z, `supported` boolean required), and
  `introduced_in` (string, optional, x.y.z). The schema
  literal carries the severity enum exactly, and the
  branches item schema carries the three typed properties
  with all three required.

  Versions are exactly "x.y.z" with non-negative integer
  components, compared numerically component by component
  (1.10.0 > 1.9.0). A branch is a candidate when it is
  supported, strictly older than `fix_version`, and — when
  `introduced_in` is given — at or after it (equal counts).
  Every non-candidate is reported in `skipped_branches`
  with exactly one reason, checked in the pinned order
  "unsupported" → "not older than fix version" →
  "predates bug introduction". Candidate actions are
  pinned by severity: critical → every candidate
  "backport"; major → same-major candidates "backport",
  others "consider"; minor → same-major candidates
  "consider", others "skip". `needs_backport` is true
  exactly when at least one candidate's action is
  "backport". Returns `{needs_backport, fix_version,
  severity, plan, skipped_branches}` with `plan` entries
  `{branch, version, action}` and `skipped_branches`
  entries `{branch, version, reason}`, each list sorted by
  version descending, ties by branch name ascending.

  The fixture literal
  (`harness/fixtures/backportcheck-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties` — confirmed by the parity
  run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object (`{fix_version, severity, branches,
  introduced_in?}`).
- Validation is path-naming and total: a missing or
  malformed `fix_version`; a missing `severity` or one
  outside its enum (the error lists the enum values);
  `branches` missing, not an array, or empty; a branch
  entry that is not an object, or has a missing, empty, or
  non-string `name`, a missing or malformed `version`, or
  a missing or non-boolean `supported` (each naming its
  `branches[<i>]` path); or an `introduced_in` present but
  not an x.y.z version throws an Error naming the
  offending path and produces no partial result (MCP:
  `isError`; CLI: exit 1). All field validation runs
  before any filtering, so a malformed branch is reported
  even when an earlier branch would have been skipped.

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **45 tests,
  45 pass, 0 fail** — version compare (equality, numeric
  components with 1.10 vs 1.9 in both directions, first
  differing component deciding); the candidate filter and
  output shape (strictly-older at exact equality, numeric
  ordering end to end, echo fields); each skip reason and
  their precedence (unsupported beats newer, unsupported
  beats predating, not-older beats the introduced_in
  check, no predates reason without `introduced_in`); the
  `introduced_in` boundary (equal counts as candidate, one
  patch below predates, introduced_in equal to fix_version
  leaving no candidates); the full severity table
  (critical all backport; major same-major backport /
  other-major consider; minor same-major consider /
  other-major skip; major with only other-major candidates
  needing no backport; numeric major compare at 10.x vs
  9.x); `needs_backport` true and false; sorting (version
  descending with 1.10 before 1.9, name-ascending ties in
  both lists, the two lists sorted independently, the full
  hand-checked README scenario); and every validation
  path (missing/malformed `fix_version` in ten forms,
  missing `severity` and seven out-of-enum forms plus all
  three enum values accepted, `branches` missing /
  non-array / empty, non-object entries at index 0 and 1,
  `name` missing/empty/non-string at index 0 and 1,
  `version` missing/malformed in each branch position,
  `supported` missing/non-boolean, malformed
  `introduced_in` in seven forms, 0.0.0 valid everywhere,
  unknown extra fields ignored top-level and per-branch,
  and no partial result on invalid input).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `check` with no `--input` exits 2;
  `check --input <missing file>` exits 1 naming the file;
  `check --input <valid file>` exits 0 and prints exactly
  the README example output (major severity, introduced_in
  2.4.0: plan 3.1.4/3.0.9 backport, 2.5.1 consider;
  skipped 2.3.8 predates bug introduction, 1.9.0
  unsupported; `needs_backport` true); `check --input
  <invalid file>` (fix_version "3.2") exits 1 with
  `fix_version must be a version of the form x.y.z`.
- Parity: `harness/parity.py` vs
  `harness/fixtures/backportcheck-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/backportcheck`, **128 package entries**.
Resolved versions match the sibling reference tree
(`@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76,
`tsx` 4.23.15, `typescript` 5.9.3, `@types/node`
20.19.43, `qs` 6.17.0). The subsequent offline
`npm install --ignore-scripts --offline`, build, tests,
and parity all ran against this lockfile's tree.

## Gaps / honest notes

- **Pinned judgement calls** (each with a dedicated test
  where applicable): (1) unknown extra fields are ignored
  rather than rejected, both top-level and inside branch
  entries (the spec says they are ignored); (2) a
  non-object top-level arguments value is treated as an
  empty object, so it fails as `fix_version is required`
  (per spec); (3) error-message wording follows the
  fleet's path-naming pattern (e.g. `branches[1].version
  must be a version of the form x.y.z`); the spec pins the
  three skip-reason strings exactly, and those are used
  verbatim. No other spec ambiguity was found in the core
  behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
