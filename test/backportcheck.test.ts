import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBackport, compareVersions } from "../src/backportcheck.js";

/**
 * All tests are pure local computation over inline branch
 * lists: no filesystem and no network. The version-compare
 * pins (numeric components, equality), the candidate
 * filter, each skip reason and their precedence, the full
 * severity x same-major action table, the introduced_in
 * boundary, sorting with ties, needs_backport in both
 * states, and every validation path — including malformed
 * versions in each position — are each pinned.
 */

const branch = (name: string, version: string, supported = true) => ({
  name,
  version,
  supported,
});

describe("compareVersions — numeric component compare", () => {
  it("equal versions compare equal", () => {
    assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
    assert.equal(compareVersions("0.0.0", "0.0.0"), 0);
    assert.equal(compareVersions("10.20.30", "10.20.30"), 0);
  });

  it("components compare numerically, not lexicographically (1.10 vs 1.9)", () => {
    assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
    assert.ok(compareVersions("1.9.0", "1.10.0") < 0);
    assert.ok(compareVersions("2.0.0", "1.99.99") > 0);
    assert.ok(compareVersions("0.0.10", "0.0.9") > 0);
  });

  it("the first differing component decides", () => {
    assert.ok(compareVersions("1.2.4", "1.2.3") > 0);
    assert.ok(compareVersions("1.3.0", "1.2.99") > 0);
    assert.ok(compareVersions("0.9.9", "1.0.0") < 0);
  });
});

describe("checkBackport — candidate filter and output shape", () => {
  it("a supported branch older than the fix version is a candidate", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("release-1", "1.5.0")],
    });
    assert.deepEqual(out, {
      needs_backport: true,
      fix_version: "2.0.0",
      severity: "critical",
      plan: [{ branch: "release-1", version: "1.5.0", action: "backport" }],
      skipped_branches: [],
    });
  });

  it("a branch at exactly the fix version is not a candidate (strictly older)", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("release-2", "2.0.0")],
    });
    assert.deepEqual(out.plan, []);
    assert.deepEqual(out.skipped_branches, [
      { branch: "release-2", version: "2.0.0", reason: "not older than fix version" },
    ]);
    assert.equal(out.needs_backport, false);
  });

  it("version ordering is numeric end to end: 1.10.0 is newer than a 1.9.0 fix", () => {
    const out = checkBackport({
      fix_version: "1.9.0",
      severity: "critical",
      branches: [branch("release-1.10", "1.10.0"), branch("release-1.8", "1.8.0")],
    });
    assert.deepEqual(out.plan, [
      { branch: "release-1.8", version: "1.8.0", action: "backport" },
    ]);
    assert.deepEqual(out.skipped_branches, [
      { branch: "release-1.10", version: "1.10.0", reason: "not older than fix version" },
    ]);
  });

  it("fix_version and severity are echoed in the output", () => {
    const out = checkBackport({
      fix_version: "4.1.2",
      severity: "minor",
      branches: [branch("old", "0.1.0", false)],
    });
    assert.equal(out.fix_version, "4.1.2");
    assert.equal(out.severity, "minor");
  });
});

describe("checkBackport — skip reasons and their precedence", () => {
  it("an unsupported branch is skipped as unsupported", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("eol", "1.0.0", false)],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "eol", version: "1.0.0", reason: "unsupported" },
    ]);
  });

  it("a branch newer than the fix version is skipped as not older", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("future", "3.1.0")],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "future", version: "3.1.0", reason: "not older than fix version" },
    ]);
  });

  it("a supported older branch before introduced_in is skipped as predating the bug", () => {
    const out = checkBackport({
      fix_version: "3.0.0",
      severity: "critical",
      introduced_in: "2.0.0",
      branches: [branch("ancient", "1.5.0")],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "ancient", version: "1.5.0", reason: "predates bug introduction" },
    ]);
  });

  it("precedence: a branch both unsupported and newer reports unsupported", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("dead-future", "9.9.9", false)],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "dead-future", version: "9.9.9", reason: "unsupported" },
    ]);
  });

  it("precedence: a branch both unsupported and predating the bug reports unsupported", () => {
    const out = checkBackport({
      fix_version: "3.0.0",
      severity: "critical",
      introduced_in: "2.0.0",
      branches: [branch("dead-old", "1.0.0", false)],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "dead-old", version: "1.0.0", reason: "unsupported" },
    ]);
  });

  it("precedence: a supported branch newer than the fix reports not-older even when introduced_in is later still", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      introduced_in: "2.5.0",
      branches: [branch("newer", "3.0.0")],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "newer", version: "3.0.0", reason: "not older than fix version" },
    ]);
  });

  it("without introduced_in, no branch is skipped for predating the bug", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("ancient", "0.0.1")],
    });
    assert.deepEqual(out.plan, [
      { branch: "ancient", version: "0.0.1", action: "backport" },
    ]);
    assert.deepEqual(out.skipped_branches, []);
  });
});

describe("checkBackport — introduced_in boundary", () => {
  it("a branch at exactly introduced_in is a candidate (equal counts)", () => {
    const out = checkBackport({
      fix_version: "3.0.0",
      severity: "critical",
      introduced_in: "2.0.0",
      branches: [branch("boundary", "2.0.0")],
    });
    assert.deepEqual(out.plan, [
      { branch: "boundary", version: "2.0.0", action: "backport" },
    ]);
    assert.deepEqual(out.skipped_branches, []);
  });

  it("a branch one patch below introduced_in predates the bug", () => {
    const out = checkBackport({
      fix_version: "3.0.0",
      severity: "critical",
      introduced_in: "2.0.0",
      branches: [branch("just-before", "1.99.99")],
    });
    assert.deepEqual(out.skipped_branches, [
      { branch: "just-before", version: "1.99.99", reason: "predates bug introduction" },
    ]);
  });

  it("introduced_in equal to fix_version leaves no candidates among older branches", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      introduced_in: "2.0.0",
      branches: [branch("older", "1.0.0")],
    });
    assert.deepEqual(out.plan, []);
    assert.deepEqual(out.skipped_branches, [
      { branch: "older", version: "1.0.0", reason: "predates bug introduction" },
    ]);
    assert.equal(out.needs_backport, false);
  });
});

describe("checkBackport — severity action table", () => {
  // Fix lands in 3.2.0: same-major candidates are 3.x, other-major are 2.x/1.x.
  const branches = [
    branch("same-major", "3.1.0"),
    branch("same-major-old", "3.0.0"),
    branch("other-major", "2.9.9"),
    branch("older-major", "1.0.0"),
  ];

  it("critical: every candidate is backport", () => {
    const out = checkBackport({ fix_version: "3.2.0", severity: "critical", branches });
    assert.deepEqual(
      out.plan.map((p) => [p.branch, p.action]),
      [
        ["same-major", "backport"],
        ["same-major-old", "backport"],
        ["other-major", "backport"],
        ["older-major", "backport"],
      ],
    );
    assert.equal(out.needs_backport, true);
  });

  it("major: same major is backport, other majors are consider", () => {
    const out = checkBackport({ fix_version: "3.2.0", severity: "major", branches });
    assert.deepEqual(
      out.plan.map((p) => [p.branch, p.action]),
      [
        ["same-major", "backport"],
        ["same-major-old", "backport"],
        ["other-major", "consider"],
        ["older-major", "consider"],
      ],
    );
    assert.equal(out.needs_backport, true);
  });

  it("minor: same major is consider, other majors are skip", () => {
    const out = checkBackport({ fix_version: "3.2.0", severity: "minor", branches });
    assert.deepEqual(
      out.plan.map((p) => [p.branch, p.action]),
      [
        ["same-major", "consider"],
        ["same-major-old", "consider"],
        ["other-major", "skip"],
        ["older-major", "skip"],
      ],
    );
    assert.equal(out.needs_backport, false);
  });

  it("major with only other-major candidates still needs no backport", () => {
    const out = checkBackport({
      fix_version: "3.2.0",
      severity: "major",
      branches: [branch("other-major", "2.9.9")],
    });
    assert.deepEqual(out.plan, [
      { branch: "other-major", version: "2.9.9", action: "consider" },
    ]);
    assert.equal(out.needs_backport, false);
  });

  it("same-major is decided by the numeric major component (10.x vs 9.x)", () => {
    const out = checkBackport({
      fix_version: "10.0.0",
      severity: "major",
      branches: [branch("nine-new", "9.9.9"), branch("nine", "9.0.0")],
    });
    // 9.9.9 and 9.0.0 are both other-major relative to a 10.x fix.
    assert.deepEqual(
      out.plan.map((p) => p.action),
      ["consider", "consider"],
    );
    const out2 = checkBackport({
      fix_version: "10.1.0",
      severity: "major",
      branches: [branch("ten", "10.0.5")],
    });
    assert.deepEqual(out2.plan, [
      { branch: "ten", version: "10.0.5", action: "backport" },
    ]);
  });
});

describe("checkBackport — needs_backport", () => {
  it("is true when at least one candidate is backport, even alongside skips", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("a", "1.0.0"), branch("b", "0.5.0", false)],
    });
    assert.equal(out.needs_backport, true);
  });

  it("is false when there are no candidates at all", () => {
    const out = checkBackport({
      fix_version: "2.0.0",
      severity: "critical",
      branches: [branch("current", "2.0.0"), branch("eol", "1.0.0", false)],
    });
    assert.equal(out.needs_backport, false);
    assert.deepEqual(out.plan, []);
  });

  it("is false for minor when every candidate is consider or skip", () => {
    const out = checkBackport({
      fix_version: "2.1.0",
      severity: "minor",
      branches: [branch("same-major", "2.0.0"), branch("other-major", "1.0.0")],
    });
    assert.deepEqual(
      out.plan.map((p) => p.action),
      ["consider", "skip"],
    );
    assert.equal(out.needs_backport, false);
  });
});

describe("checkBackport — sorting", () => {
  it("plan is sorted by version descending", () => {
    const out = checkBackport({
      fix_version: "5.0.0",
      severity: "critical",
      branches: [
        branch("v2", "2.0.0"),
        branch("v4", "4.0.0"),
        branch("v3", "3.0.0"),
        branch("v1-10", "1.10.0"),
        branch("v1-9", "1.9.0"),
      ],
    });
    assert.deepEqual(
      out.plan.map((p) => p.branch),
      ["v4", "v3", "v2", "v1-10", "v1-9"],
    );
  });

  it("plan version ties break by branch name ascending", () => {
    const out = checkBackport({
      fix_version: "5.0.0",
      severity: "critical",
      branches: [
        branch("zeta", "2.0.0"),
        branch("alpha", "2.0.0"),
        branch("mid", "2.0.0"),
      ],
    });
    assert.deepEqual(
      out.plan.map((p) => p.branch),
      ["alpha", "mid", "zeta"],
    );
  });

  it("skipped_branches is sorted by version descending, ties by name ascending", () => {
    const out = checkBackport({
      fix_version: "5.0.0",
      severity: "critical",
      branches: [
        branch("zeta", "9.0.0", false),
        branch("alpha", "9.0.0", false),
        branch("newer", "7.0.0"),
        branch("older-skip", "6.0.0"),
      ],
    });
    assert.deepEqual(
      out.skipped_branches.map((s) => s.branch),
      ["alpha", "zeta", "newer", "older-skip"],
    );
  });

  it("plan and skipped are sorted independently of each other", () => {
    const out = checkBackport({
      fix_version: "3.2.0",
      severity: "major",
      introduced_in: "2.4.0",
      branches: [
        branch("release-3.1", "3.1.4"),
        branch("release-3.0", "3.0.9"),
        branch("release-2.5", "2.5.1"),
        branch("release-2.3", "2.3.8"),
        branch("release-1.9", "1.9.0", false),
      ],
    });
    assert.deepEqual(out, {
      needs_backport: true,
      fix_version: "3.2.0",
      severity: "major",
      plan: [
        { branch: "release-3.1", version: "3.1.4", action: "backport" },
        { branch: "release-3.0", version: "3.0.9", action: "backport" },
        { branch: "release-2.5", version: "2.5.1", action: "consider" },
      ],
      skipped_branches: [
        { branch: "release-2.3", version: "2.3.8", reason: "predates bug introduction" },
        { branch: "release-1.9", version: "1.9.0", reason: "unsupported" },
      ],
    });
  });
});

describe("checkBackport — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => checkBackport(args), { message });

  const valid = {
    fix_version: "2.0.0",
    severity: "critical",
    branches: [branch("a", "1.0.0")],
  };

  it("fix_version missing names fix_version", () => {
    throws({ severity: "critical", branches: valid.branches }, "fix_version is required");
    throws({}, "fix_version is required");
    throws(null, "fix_version is required");
    throws([], "fix_version is required");
    throws("nope", "fix_version is required");
  });

  it("fix_version malformed names fix_version", () => {
    for (const bad of ["2.0", "2.0.0.1", "v2.0.0", "2.x.0", "2.0.0-beta", "", " 2.0.0", 200, null, true]) {
      throws(
        { ...valid, fix_version: bad },
        "fix_version must be a version of the form x.y.z",
      );
    }
  });

  it("severity missing names severity", () => {
    throws(
      { fix_version: "2.0.0", branches: valid.branches },
      "severity is required",
    );
  });

  it("severity outside the enum names severity, with the enum listed", () => {
    const message = 'severity must be one of "critical", "major", "minor"';
    for (const bad of ["blocker", "CRITICAL", "Major", "", 1, null, true]) {
      throws({ ...valid, severity: bad }, message);
    }
  });

  it("every severity enum value is accepted", () => {
    for (const severity of ["critical", "major", "minor"]) {
      const out = checkBackport({ ...valid, severity });
      assert.equal(out.severity, severity);
    }
  });

  it("branches missing names branches", () => {
    throws({ fix_version: "2.0.0", severity: "critical" }, "branches is required");
  });

  it("branches not an array names branches", () => {
    for (const bad of ["release-1", 3, null, true, { name: "a" }]) {
      throws({ ...valid, branches: bad }, "branches must be an array");
    }
  });

  it("branches empty names branches", () => {
    throws({ ...valid, branches: [] }, "branches must be a non-empty array");
  });

  it("a non-object branch entry names its index path", () => {
    throws({ ...valid, branches: ["release-1"] }, "branches[0] must be an object");
    throws({ ...valid, branches: [null] }, "branches[0] must be an object");
    throws(
      { ...valid, branches: [branch("a", "1.0.0"), 42] },
      "branches[1] must be an object",
    );
    throws({ ...valid, branches: [["a", "1.0.0", true]] }, "branches[0] must be an object");
  });

  it("branch name missing, empty, or non-string names branches[i].name", () => {
    throws(
      { ...valid, branches: [{ version: "1.0.0", supported: true }] },
      "branches[0].name is required",
    );
    for (const bad of ["", 7, null, true, ["a"]]) {
      throws(
        { ...valid, branches: [{ name: bad, version: "1.0.0", supported: true }] },
        "branches[0].name must be a non-empty string",
      );
    }
    throws(
      {
        ...valid,
        branches: [branch("ok", "1.0.0"), { name: "", version: "1.0.0", supported: true }],
      },
      "branches[1].name must be a non-empty string",
    );
  });

  it("branch version missing or malformed names branches[i].version", () => {
    throws(
      { ...valid, branches: [{ name: "a", supported: true }] },
      "branches[0].version is required",
    );
    for (const bad of ["1.0", "1.0.0.1", "v1.0.0", "1.x.0", "", 100, null]) {
      throws(
        { ...valid, branches: [{ name: "a", version: bad, supported: true }] },
        "branches[0].version must be a version of the form x.y.z",
      );
    }
    throws(
      {
        ...valid,
        branches: [branch("ok", "1.0.0"), { name: "b", version: "2", supported: true }],
      },
      "branches[1].version must be a version of the form x.y.z",
    );
  });

  it("branch supported missing or non-boolean names branches[i].supported", () => {
    throws(
      { ...valid, branches: [{ name: "a", version: "1.0.0" }] },
      "branches[0].supported is required",
    );
    for (const bad of ["true", 1, 0, null, "yes"]) {
      throws(
        { ...valid, branches: [{ name: "a", version: "1.0.0", supported: bad }] },
        "branches[0].supported must be a boolean",
      );
    }
  });

  it("introduced_in present but malformed names introduced_in", () => {
    for (const bad of ["1.0", "v1.0.0", "1.0.0-rc1", "", 100, null, true]) {
      throws(
        { ...valid, introduced_in: bad },
        "introduced_in must be a version of the form x.y.z",
      );
    }
  });

  it("introduced_in absent is fine; the zero version 0.0.0 is a valid version everywhere", () => {
    const out = checkBackport({
      fix_version: "0.0.1",
      severity: "critical",
      branches: [branch("zero", "0.0.0")],
    });
    assert.deepEqual(out.plan, [
      { branch: "zero", version: "0.0.0", action: "backport" },
    ]);
  });

  it("unknown extra fields are ignored, top-level and per-branch (pinned judgement call)", () => {
    const out = checkBackport({
      ...valid,
      channel: "stable",
      branches: [{ name: "a", version: "1.0.0", supported: true, owner: "team-x" }],
    });
    assert.deepEqual(out.plan, [
      { branch: "a", version: "1.0.0", action: "backport" },
    ]);
  });

  it("no partial result is produced on invalid input", () => {
    assert.throws(() =>
      checkBackport({
        fix_version: "2.0.0",
        severity: "critical",
        branches: [branch("good", "1.0.0"), branch("bad", "not-a-version")],
      }),
    );
  });
});
