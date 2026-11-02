/**
 * backportcheck core: decide whether a fix needs a backport.
 *
 *   checkBackport(args) -> { needs_backport, fix_version,
 *                            severity, plan, skipped_branches }
 *
 * Versions are exactly "x.y.z" with non-negative integer
 * components, compared numerically component by component
 * (so 1.10.0 is newer than 1.9.0). Anything else is a
 * validation error naming its path.
 *
 * Candidate filter (pinned): a branch is a candidate when
 * ALL hold — `supported` is true; its version is strictly
 * older than `fix_version`; and (`introduced_in` is absent
 * OR its version is >= `introduced_in`).
 *
 * Every non-candidate branch is reported in
 * `skipped_branches` with exactly one reason, checked in
 * this pinned order: "unsupported" (supported is false),
 * "not older than fix version" (version >= fix_version),
 * "predates bug introduction" (version < introduced_in).
 *
 * Candidate actions by severity (pinned):
 *   critical -> every candidate "backport".
 *   major    -> candidates with the same major component
 *               as `fix_version` "backport"; all other
 *               candidates "consider".
 *   minor    -> candidates with the same major component
 *               as `fix_version` "consider"; all other
 *               candidates "skip".
 *
 * `needs_backport` is true exactly when at least one
 * candidate's action is "backport". `plan` and
 * `skipped_branches` are each sorted by version descending,
 * ties broken by branch name ascending.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path and no partial
 * result is produced. Unknown extra fields are ignored; a
 * non-object top-level argument is treated as {}.
 */
import type {
  BackportAction,
  BackportResult,
  PlanEntry,
  ReleaseBranch,
  Severity,
  SkippedBranch,
  SkipReason,
} from "./types.js";

export const VERSION = "0.1.0";

const SEVERITIES: readonly Severity[] = ["critical", "major", "minor"];

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Compare two validated x.y.z versions numerically, component by component. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** The major component of a validated x.y.z version. */
function majorOf(version: string): number {
  return Number(version.split(".")[0]);
}

/** Validate a version field at the given path; returns the version string. */
function requireVersion(value: unknown, path: string): string {
  if (value === undefined) throw new Error(`${path} is required`);
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new Error(`${path} must be a version of the form x.y.z`);
  }
  return value;
}

/** Validate one branches entry at the given index. */
function validateBranch(entry: unknown, index: number): ReleaseBranch {
  const path = `branches[${index}]`;
  if (!isRecord(entry)) throw new Error(`${path} must be an object`);

  if (entry.name === undefined) throw new Error(`${path}.name is required`);
  if (typeof entry.name !== "string" || entry.name.length === 0) {
    throw new Error(`${path}.name must be a non-empty string`);
  }

  const version = requireVersion(entry.version, `${path}.version`);

  if (entry.supported === undefined) {
    throw new Error(`${path}.supported is required`);
  }
  if (typeof entry.supported !== "boolean") {
    throw new Error(`${path}.supported must be a boolean`);
  }

  return { name: entry.name, version, supported: entry.supported };
}

/**
 * Validate the raw arguments object and return the
 * normalised input.
 */
function validateArgs(args: unknown): {
  fixVersion: string;
  severity: Severity;
  branches: ReleaseBranch[];
  introducedIn?: string;
} {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  const fixVersion = requireVersion(raw.fix_version, "fix_version");

  if (raw.severity === undefined) throw new Error("severity is required");
  if (
    typeof raw.severity !== "string" ||
    !SEVERITIES.includes(raw.severity as Severity)
  ) {
    throw new Error(
      `severity must be one of ${SEVERITIES.map((s) => `"${s}"`).join(", ")}`,
    );
  }
  const severity = raw.severity as Severity;

  if (raw.branches === undefined) throw new Error("branches is required");
  if (!Array.isArray(raw.branches)) throw new Error("branches must be an array");
  if (raw.branches.length === 0) {
    throw new Error("branches must be a non-empty array");
  }
  const branches = raw.branches.map((entry, i) => validateBranch(entry, i));

  let introducedIn: string | undefined;
  if (raw.introduced_in !== undefined) {
    introducedIn = requireVersion(raw.introduced_in, "introduced_in");
  }

  return { fixVersion, severity, branches, introducedIn };
}

/** Assign a candidate's action from the severity table (pinned). */
function actionFor(
  severity: Severity,
  branchVersion: string,
  fixVersion: string,
): BackportAction {
  const sameMajor = majorOf(branchVersion) === majorOf(fixVersion);
  switch (severity) {
    case "critical":
      return "backport";
    case "major":
      return sameMajor ? "backport" : "consider";
    case "minor":
      return sameMajor ? "consider" : "skip";
  }
}

/** Sort by version descending, ties by branch name ascending. */
function byVersionDescThenName(
  a: { branch: string; version: string },
  b: { branch: string; version: string },
): number {
  const byVersion = compareVersions(b.version, a.version);
  if (byVersion !== 0) return byVersion;
  return a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0;
}

/** Decide whether a fix needs a backport, and to which branches. */
export function checkBackport(args: unknown): BackportResult {
  const { fixVersion, severity, branches, introducedIn } = validateArgs(args);

  const plan: PlanEntry[] = [];
  const skipped: SkippedBranch[] = [];

  for (const branch of branches) {
    let reason: SkipReason | undefined;
    if (!branch.supported) {
      reason = "unsupported";
    } else if (compareVersions(branch.version, fixVersion) >= 0) {
      reason = "not older than fix version";
    } else if (
      introducedIn !== undefined &&
      compareVersions(branch.version, introducedIn) < 0
    ) {
      reason = "predates bug introduction";
    }

    if (reason !== undefined) {
      skipped.push({ branch: branch.name, version: branch.version, reason });
    } else {
      plan.push({
        branch: branch.name,
        version: branch.version,
        action: actionFor(severity, branch.version, fixVersion),
      });
    }
  }

  plan.sort(byVersionDescThenName);
  skipped.sort(byVersionDescThenName);

  return {
    needs_backport: plan.some((entry) => entry.action === "backport"),
    fix_version: fixVersion,
    severity,
    plan,
    skipped_branches: skipped,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
