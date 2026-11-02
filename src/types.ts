/**
 * backportcheck types.
 *
 * backportcheck decides whether a fix that lands in one
 * version should also be carried to older release branches.
 * The caller supplies the fix version, the fix's severity,
 * the release branches on record (each with a name, a
 * version, and whether it is still supported), and
 * optionally the version that introduced the bug. From
 * that data alone, as pure local computation, backportcheck
 * reports:
 *
 *   - whether any branch needs the backport
 *   - the plan: one entry per candidate branch, with the
 *     action the severity assigns it
 *   - the skipped branches, each with the single reason
 *     it was ruled out
 *
 * A branch is a candidate when it is supported, strictly
 * older than the fix version, and — when the bug's
 * introduction version is given — not older than that
 * version. Versions are exactly "x.y.z" with non-negative
 * integer components, compared numerically component by
 * component.
 */

/** Severity of the fix being considered for backport. */
export type Severity = "critical" | "major" | "minor";

/** Action assigned to a candidate branch. */
export type BackportAction = "backport" | "consider" | "skip";

/** Reason a non-candidate branch was ruled out. */
export type SkipReason =
  | "unsupported"
  | "not older than fix version"
  | "predates bug introduction";

/** One release branch, as supplied by the caller. */
export interface ReleaseBranch {
  /** Branch name; non-empty. */
  name: string;
  /** Branch version, as x.y.z. */
  version: string;
  /** Whether the branch is still supported. */
  supported: boolean;
}

/** One candidate branch in the plan, with its action. */
export interface PlanEntry {
  /** Branch name. */
  branch: string;
  /** Branch version, as x.y.z. */
  version: string;
  /** Action assigned by the fix's severity. */
  action: BackportAction;
}

/** One non-candidate branch, with the reason it was ruled out. */
export interface SkippedBranch {
  /** Branch name. */
  branch: string;
  /** Branch version, as x.y.z. */
  version: string;
  /** The single reason the branch was ruled out. */
  reason: SkipReason;
}

/** The backport decision for a fix. */
export interface BackportResult {
  /** True exactly when at least one candidate's action is "backport". */
  needs_backport: boolean;
  /** The version the fix lands in, as x.y.z. */
  fix_version: string;
  /** The severity of the fix. */
  severity: Severity;
  /** Candidate branches with their actions, sorted by version descending (ties by branch name ascending). */
  plan: PlanEntry[];
  /** Non-candidate branches with their reasons, sorted by version descending (ties by branch name ascending). */
  skipped_branches: SkippedBranch[];
}
