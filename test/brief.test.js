import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { classifyRisk, createBrief, validateProposal } from "../src/brief.js";

const valid = {
  actor: "release agent",
  targetSystem: "GitHub",
  action: "create release-candidate pull request",
  payloadSummary: "Open a PR with verification notes",
  payload: { title: "Release candidate", token: "secret" },
  impact: "Creates a draft review surface; no merge or publish.",
  rollback: "Close the PR branch without merging.",
  approvalText: "Approve release agent to create release-candidate pull request on GitHub for run artifact index."
};

function runCli(args, input) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-cli-"));
  const proposal = path.join(directory, "proposal.json");
  if (input !== undefined) fs.writeFileSync(proposal, JSON.stringify(input));
  return spawnSync(
    process.execPath,
    ["./bin/skill-approval-brief.js", ...(input === undefined ? [] : [proposal]), ...args],
    { cwd: process.cwd(), encoding: "utf8" }
  );
}

test("creates approval-ready brief for valid write action", () => {
  const brief = createBrief(valid);
  assert.equal(brief.status, "approval-ready");
  assert.equal(brief.risk, "write-after-approval");
  assert.match(brief.payloadPreview, /REDACTED/);
});

test("redacts credential key variants recursively", () => {
  const secrets = ["live-secret", "live-key", "capital-secret", "nested-secret"];
  const brief = createBrief({
    ...valid,
    payload: {
      accessToken: secrets[0],
      api_key: secrets[1],
      Token: secrets[2],
      metadata: [{ user_password: secrets[3], label: "keep me" }],
      tokenCount: 2
    }
  });

  for (const secret of secrets) assert.doesNotMatch(brief.payloadPreview, new RegExp(secret));
  assert.match(brief.payloadPreview, /"label": "keep me"/);
  assert.match(brief.payloadPreview, /"tokenCount": 2/);
  assert.equal(brief.payloadPreview.match(/\[REDACTED\]/g)?.length, secrets.length);
});

test("reports missing required fields", () => {
  const errors = validateProposal({ actor: "agent" });
  assert.ok(errors.includes("targetSystem must be a non-empty string"));
});

test("CLI emits a structured JSON brief for an incomplete proposal", () => {
  const result = runCli(["--format", "json"], { actor: "agent" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid approval proposal/);
  const brief = JSON.parse(result.stdout);
  assert.equal(brief.actor, "agent");
  assert.equal(brief.payloadPreview, "");
  assert.equal(brief.status, "invalid");
  assert.equal(brief.risk, "unclassified");
  assert.ok(brief.errors.includes("payloadSummary must be a non-empty string"));
  for (const field of ["targetSystem", "action", "impact", "rollback", "approvalText"]) {
    assert.equal(brief[field], "");
  }
});

test("CLI markdown exposes validation errors for an incomplete proposal", () => {
  const result = runCli(["--format", "markdown"], { actor: "agent" });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /## Validation Errors/);
  assert.match(result.stdout, /- payloadSummary must be a non-empty string/);
  assert.doesNotMatch(result.stderr, /Cannot read properties/);
});

test("CLI validates max payload characters as a positive integer", () => {
  for (const value of ["nope", "0", "-1", "1.5"]) {
    const result = runCli(["--max-payload-chars", value], valid);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--max-payload-chars must be a positive integer/);
  }

  const result = runCli(["--max-payload-chars", "40"], valid);
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).payloadPreview, /truncated/);
});

test("CLI rejects extra proposal paths", () => {
  const result = runCli(["fixtures/blocked-action.json"], valid);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Only one input proposal JSON may be provided/);
});

test("CLI value-taking options reject missing values consistently", () => {
  for (const option of ["--format", "--output", "--evidence", "--policy", "--max-payload-chars", "--redact-key"]) {
    const result = runCli([option], valid);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`${option} requires a value`));

    const followedByOption = runCli([option, "--help"], valid);
    assert.equal(followedByOption.status, 1);
    assert.match(followedByOption.stderr, new RegExp(`${option} requires a value`));
  }
});

test("rejects vague approval text", () => {
  const errors = validateProposal({ ...valid, approvalText: "ok" });
  assert.ok(errors.some((error) => error.includes("approvalText")));
});

test("rejects approval text that omits the action or target", () => {
  const unscopedErrors = validateProposal({
    ...valid,
    action: "delete repository",
    approvalText: "This sentence is long enough but names neither action nor target"
  });
  const actionOnlyErrors = validateProposal({
    ...valid,
    action: "delete repository",
    approvalText: "Approve the delete repository action."
  });
  const targetOnlyErrors = validateProposal({
    ...valid,
    action: "delete repository",
    approvalText: "Approve this action on GitHub."
  });
  for (const errors of [unscopedErrors, actionOnlyErrors, targetOnlyErrors]) {
    assert.ok(errors.includes("approvalText must name the action and target explicitly"));
  }
});

test("accepts approval text with normalized action and target phrases", () => {
  const errors = validateProposal({
    ...valid,
    targetSystem: "GitHub Cloud",
    action: "create release-candidate pull request",
    approvalText: "Approve: CREATE RELEASE CANDIDATE PULL REQUEST on GitHub Cloud."
  });
  assert.deepEqual(errors, []);
});

test("rejects non-object proposal roots", () => {
  for (const proposal of [null, [], "proposal", 42, true]) {
    assert.deepEqual(validateProposal(proposal), ["proposal must be an object"]);
    assert.throws(
      () => createBrief(proposal),
      (error) => error.brief.status === "invalid"
        && error.brief.risk === "unclassified"
        && error.brief.errors[0] === "proposal must be an object"
    );
  }
});

test("rejects non-string and blank required proposal fields", () => {
  for (const field of ["actor", "targetSystem", "action", "payloadSummary", "impact", "rollback", "approvalText"]) {
    for (const value of [{ value: "object" }, ["array"], 42, true, null, "", "   "]) {
      const errors = validateProposal({ ...valid, [field]: value });
      assert.ok(errors.includes(`${field} must be a non-empty string`));
    }
  }
});

test("rejects invalid proposal modes", () => {
  for (const mode of ["READ", "execute", "", null, 42, { mode: "read" }]) {
    assert.ok(validateProposal({ ...valid, mode }).includes("mode must be one of: read, draft, write"));
  }
  assert.deepEqual(validateProposal({ ...valid, mode: "write" }), []);
});

test("CLI emits structured invalid output for schema-invalid proposals", () => {
  for (const proposal of [
    null,
    [],
    { ...valid, payloadSummary: 42 },
    { ...valid, mode: "execute" }
  ]) {
    const result = runCli(["--format", "json"], proposal);
    assert.equal(result.status, 1);
    const brief = JSON.parse(result.stdout);
    assert.equal(brief.status, "invalid");
    assert.equal(brief.risk, "unclassified");
    assert.notEqual(brief.status, "approval-ready");
    assert.ok(brief.errors.length > 0);
  }
});

test("classifies consistent read and draft modes", () => {
  assert.equal(classifyRisk({
    ...valid,
    action: "inspect repository settings",
    impact: "Read-only inspection with no external write.",
    mode: "read"
  }), "read-only");
  assert.equal(classifyRisk({
    ...valid,
    action: "prepare a local release plan",
    impact: "Draft-only local plan; nothing is published.",
    mode: "draft"
  }), "draft-only");
});

test("conservatively elevates read and draft modes that describe writes", () => {
  for (const mode of ["read", "draft"]) {
    assert.equal(classifyRisk({
      ...valid,
      action: "create issue",
      impact: "Creates a public GitHub issue.",
      mode
    }), "write-after-approval");
  }
});

test("classifies affirmative mutation inflections as writes despite a contradictory mode hint", () => {
  const writeActions = [
    "close pull request",
    "closes pull request",
    "closed pull request",
    "closing pull request",
    "rename repository",
    "renames repository",
    "renamed repository",
    "renaming repository",
    "invite collaborator",
    "invites collaborator",
    "invited collaborator",
    "inviting collaborator",
    "archive repository",
    "archives repository",
    "archived repository",
    "archiving repository",
    "reopen issue",
    "reopens issue",
    "reopened issue",
    "reopening issue",
    "lock conversation",
    "locks conversation",
    "locked conversation",
    "locking conversation",
    "assign issue",
    "assigns issue",
    "assigned issue",
    "assigning issue",
    "label issue",
    "labels issue",
    "labeled issue",
    "labeling issue",
    "add label",
    "adds collaborator",
    "added assignee",
    "adding team access",
    "remove label",
    "removes collaborator",
    "removed assignee",
    "removing team access",
    "grant access",
    "grants access",
    "granted access",
    "granting access",
    "revoke access",
    "revokes access",
    "revoked access",
    "revoking access",
    "unlock conversation",
    "unassign issue",
    "unlabel issue",
    "enable repository feature",
    "disable repository feature",
    "restore repository"
  ];

  for (const mode of ["read", "draft"]) {
    for (const action of writeActions) {
      assert.equal(classifyRisk({
        ...valid,
        action,
        impact: "Changes GitHub state.",
        mode
      }), "write-after-approval", `${mode}: ${action}`);
    }
  }
});

test("preserves read-only context for resources already in a mutated state", () => {
  const readActions = [
    "inspect closed pull requests",
    "review repository renames",
    "list invited collaborators",
    "inspect archived repositories",
    "view reopened issues",
    "read locked conversations",
    "list assigned issues",
    "inspect labeled pull requests",
    "review removed collaborators",
    "audit granted team access"
  ];

  for (const action of readActions) {
    assert.equal(classifyRisk({
      ...valid,
      action,
      impact: "Read-only inspection with no external write.",
      mode: "read"
    }), "read-only", action);
  }
});

test("write descriptions take precedence over read-only and draft-only descriptions", () => {
  assert.equal(classifyRisk({
    ...valid,
    action: "publish the release notes",
    impact: "Described as read-only, but publishes changes externally.",
    mode: "read"
  }), "write-after-approval");
  assert.equal(classifyRisk({
    ...valid,
    action: "update the pull request",
    impact: "Starts from a draft-only plan, then updates GitHub.",
    mode: "draft"
  }), "write-after-approval");
  assert.equal(classifyRisk({
    ...valid,
    action: "inspect repository settings",
    impact: "Read-only inspection with no external write.",
    mode: "write"
  }), "write-after-approval");
});

test("CLI elevates a conflicting read-mode proposal to write-after-approval", () => {
  const proposal = {
    ...valid,
    action: "create issue",
    impact: "Creates a public GitHub issue.",
    approvalText: "Approve release agent to create issue on GitHub.",
    mode: "read"
  };
  const result = runCli(["--format", "json"], proposal);

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).risk, "write-after-approval");
});

test("CLI elevates representative lifecycle, access, and metadata mutations", () => {
  for (const action of [
    "closing pull request",
    "renames repository",
    "invite collaborator",
    "archiving repository",
    "reopens issue",
    "locked conversation",
    "assigning issue",
    "adds label",
    "removed collaborator",
    "granting team access"
  ]) {
    const proposal = {
      ...valid,
      action,
      impact: "Changes GitHub state.",
      approvalText: `Approve release agent to ${action} on GitHub.`,
      mode: "read"
    };
    const result = runCli(["--format", "json"], proposal);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).risk, "write-after-approval", action);
  }
});

test("CLI preserves read-only context for mutated resources", () => {
  for (const action of ["inspect archived repositories", "list assigned issues", "review labeled pull requests"]) {
    const proposal = {
      ...valid,
      action,
      impact: "Read-only inspection with no external write.",
      approvalText: `Approve release agent to ${action} on GitHub.`,
      mode: "read"
    };
    const result = runCli(["--format", "json"], proposal);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).risk, "read-only", action);
  }
});

test("CLI preserves valid read-only and draft-only proposals", () => {
  const proposals = [
    {
      ...valid,
      action: "inspect repository settings",
      impact: "Read-only inspection with no external write.",
      approvalText: "Approve release agent to inspect repository settings on GitHub.",
      mode: "read",
      expectedRisk: "read-only"
    },
    {
      ...valid,
      action: "prepare a local release plan",
      impact: "Draft-only local plan; nothing is published.",
      approvalText: "Approve release agent to prepare a local release plan on GitHub.",
      mode: "draft",
      expectedRisk: "draft-only"
    }
  ];

  for (const { expectedRisk, ...proposal } of proposals) {
    const result = runCli(["--format", "json"], proposal);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).risk, expectedRisk);
  }
});

test("blocks forbidden actions", () => {
  assert.throws(() => createBrief({
    ...valid,
    action: "delete account",
    approvalText: "Approve release agent to delete account on GitHub."
  }), /Forbidden action/);
});

test("matches built-in forbidden actions on normalized token boundaries", () => {
  assert.equal(classifyRisk({
    ...valid,
    action: "DELETE—ACCOUNT",
    impact: "Permanently removes the account."
  }), "forbidden");
  assert.equal(classifyRisk({
    ...valid,
    action: "send payment",
    impact: "Transfers funds to the recipient."
  }), "forbidden");
  assert.equal(classifyRisk({
    ...valid,
    action: "delete accountancy notes",
    impact: "Removes internal accounting notes."
  }), "write-after-approval");
});

test("blocks policy-defined forbidden actions", () => {
  assert.throws(() => createBrief({
    ...valid,
    action: "bulk invite users",
    approvalText: "Approve release agent to bulk invite users on GitHub."
  }, { policy: "fixtures/policy.json" }), /Forbidden action/);
});

test("matches policy-defined forbidden actions on normalized token boundaries", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-"));
  const policy = path.join(directory, "policy.json");
  fs.writeFileSync(policy, JSON.stringify({ forbiddenActions: ["bulk invite"] }));

  assert.throws(() => createBrief({
    ...valid,
    action: "bulk-invite users",
    approvalText: "Approve release agent to bulk invite users on GitHub."
  }, { policy }), /Forbidden action/);
  assert.doesNotThrow(() => createBrief({
    ...valid,
    action: "update bulk invitees list",
    approvalText: "Approve release agent to update bulk invitees list on GitHub."
  }, { policy }));
});

test("rejects malformed forbiddenActions policy values", () => {
  const malformedValues = [
    "bulk invite users",
    42,
    null,
    { phrase: "bulk invite users" },
    [null],
    [""],
    ["   "],
    ["bulk invite users", 42]
  ];

  for (const forbiddenActions of malformedValues) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-"));
    const policy = path.join(directory, "policy.json");
    fs.writeFileSync(policy, JSON.stringify({ forbiddenActions }));
    assert.throws(
      () => createBrief(valid, { policy }),
      { name: "TypeError", message: "Policy forbiddenActions must be an array of non-empty strings." }
    );
  }
});

test("malformed policy strings cannot falsely block unrelated actions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-"));
  const policy = path.join(directory, "policy.json");
  fs.writeFileSync(policy, JSON.stringify({ forbiddenActions: "bulk invite users" }));

  assert.throws(
    () => createBrief({ ...valid, action: "create report" }, { policy }),
    /Policy forbiddenActions must be an array of non-empty strings/
  );
});

test("CLI reports malformed forbiddenActions policies without a blocked-action result", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-"));
  const policy = path.join(directory, "policy.json");
  fs.writeFileSync(policy, JSON.stringify({ forbiddenActions: "bulk invite users" }));

  const result = spawnSync(
    process.execPath,
    ["./bin/skill-approval-brief.js", "fixtures/write-action.json", "--policy", policy],
    { cwd: process.cwd(), encoding: "utf8" }
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Policy forbiddenActions must be an array of non-empty strings/);
  assert.doesNotMatch(result.stderr, /Forbidden action requires redesign/);
});

test("rejects non-object policy roots and unexpected properties", () => {
  const invalidPolicies = [
    [null, "Policy must be an object."],
    [[], "Policy must be an object."],
    ["policy", "Policy must be an object."],
    [{ unexpected: true }, "Policy contains unexpected properties: unexpected."],
    [{ zed: true, alpha: true }, "Policy contains unexpected properties: alpha, zed."]
  ];

  for (const [contents, message] of invalidPolicies) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-"));
    const policy = path.join(directory, "policy.json");
    fs.writeFileSync(policy, JSON.stringify(contents));
    assert.throws(() => createBrief(valid, { policy }), { name: "TypeError", message });
  }
});

test("CLI rejects policy schema violations before classification", () => {
  for (const contents of [null, [], { unexpected: true }]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "approval-policy-"));
    const policy = path.join(directory, "policy.json");
    fs.writeFileSync(policy, JSON.stringify(contents));
    const result = runCli(["--policy", policy], { ...valid, action: "delete account" });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Policy (must be an object|contains unexpected properties)/);
    assert.doesNotMatch(result.stderr, /Forbidden action requires redesign/);
  }
});

test("truncates payload preview", () => {
  const brief = createBrief({ ...valid, payload: { body: "x".repeat(80) } }, { maxPayloadChars: 40 });
  assert.match(brief.payloadPreview, /truncated/);
});

test("matches expected risk fixture", () => {
  const expected = JSON.parse(fs.readFileSync("fixtures/expected-risk.json", "utf8"));
  const brief = createBrief(valid);
  assert.equal(brief.status, expected.status);
  assert.equal(brief.risk, expected.risk);
  assert.equal(brief.targetSystem, expected.targetSystem);
});
