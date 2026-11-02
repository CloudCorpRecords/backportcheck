# backportcheck

A fix lands on the newest line, and then the harder question
arrives: which of the older release branches still in the
field need it too? Answering by gut feel either skips a
branch that is quietly exposed or backports everything
everywhere and burns the release team. backportcheck turns
the decision into a fixed, auditable procedure: hand it the
fix, and it hands back a plan.

First, the branches are filtered down to real candidates. A
branch qualifies only when all three hold: it is still
supported, its version is strictly older than the version
the fix lands in, and — when you say which version
introduced the bug — it is at or after that version, because
a branch older than the bug cannot contain it. Versions are
plain `x.y.z` numbers, compared numerically component by
component, so `1.10.0` correctly sorts newer than `1.9.0`.

Every branch that fails the filter is still reported, with
exactly one reason, and the reasons are checked in a fixed
order so the report never blames the wrong thing: an
unsupported branch is `unsupported` even if it is also too
new; next comes `not older than fix version`; last,
`predates bug introduction`.

Each candidate then gets an action from the severity:

- **`critical`** — every candidate is `backport`. A critical
  fix goes everywhere it can.
- **`major`** — candidates on the same major line as the
  fix are `backport`; candidates on older major lines are
  `consider`.
- **`minor`** — candidates on the same major line are
  `consider`; candidates on older major lines are `skip`.

`needs_backport` is true exactly when at least one
candidate's action is `backport`. The plan and the skipped
list are each sorted by version descending, ties broken by
branch name ascending, so the newest branches — usually the
most urgent — come first. Malformed input is a validation
error naming the offending path: a version that is not
`x.y.z`, a severity outside its enum, a branch entry missing
its name, version, or supported flag. The computation is
pure and local: no network, no configuration, and no
repository is read or touched — backportcheck only decides
the plan.

## CLI

```bash
npx @reneturcios/backportcheck check --input args.json
npx @reneturcios/backportcheck --version
```

`args.json` contains the full arguments object:

```json
{
  "fix_version": "3.2.0",
  "severity": "major",
  "introduced_in": "2.4.0",
  "branches": [
    { "name": "release-3.1", "version": "3.1.4", "supported": true },
    { "name": "release-3.0", "version": "3.0.9", "supported": true },
    { "name": "release-2.5", "version": "2.5.1", "supported": true },
    { "name": "release-2.3", "version": "2.3.8", "supported": true },
    { "name": "release-1.9", "version": "1.9.0", "supported": false }
  ]
}
```

The result is printed as JSON:

```json
{
  "needs_backport": true,
  "fix_version": "3.2.0",
  "severity": "major",
  "plan": [
    { "branch": "release-3.1", "version": "3.1.4", "action": "backport" },
    { "branch": "release-3.0", "version": "3.0.9", "action": "backport" },
    { "branch": "release-2.5", "version": "2.5.1", "action": "consider" }
  ],
  "skipped_branches": [
    { "branch": "release-2.3", "version": "2.3.8", "reason": "predates bug introduction" },
    { "branch": "release-1.9", "version": "1.9.0", "reason": "unsupported" }
  ]
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/backportcheck mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "backportcheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/backportcheck", "mcp"]
    }
  }
}
```

### Tools

- `check_backport` — Decide whether a fix needs a backport,
  and to which release branches.
  - `fix_version` (string, required) — version the fix lands
    in, as `x.y.z`
  - `severity` (string, required) — one of `critical`,
    `major`, `minor`
  - `branches` (array, required, non-empty) — release
    branches, each `{name, version, supported}` with a
    non-empty string `name`, an `x.y.z` `version`, and a
    boolean `supported`
  - `introduced_in` (string, optional) — version that
    introduced the bug, as `x.y.z`

  Returns `{needs_backport, fix_version, severity, plan,
  skipped_branches}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/backportcheck
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/backportcheck check --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
