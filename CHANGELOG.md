# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `check_backport` MCP tool and `check`
  CLI command deciding whether a fix needs a backport, and
  to which release branches.
- Pinned candidate filter: a branch qualifies when it is
  supported, strictly older than the fix version, and — when
  `introduced_in` is given — at or after the version that
  introduced the bug.
- Pinned skip reasons, checked in order: `unsupported`,
  then `not older than fix version`, then
  `predates bug introduction`.
- Pinned severity table: `critical` backports to every
  candidate; `major` backports on the fix's major line and
  marks other candidates `consider`; `minor` marks the
  fix's major line `consider` and other candidates `skip`.
- Versions compared numerically component by component;
  plan and skipped branches sorted by version descending,
  ties by branch name ascending.
- Path-naming validation errors for malformed input,
  including malformed versions in `fix_version`, in branch
  entries, and in `introduced_in`.
