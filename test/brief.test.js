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
  assert.ok(errors.includes("missing targetSystem"));
});

test("CLI emits a structured JSON brief for an incomplete proposal", () => {
  const result = runCli(["--format", "json"], { actor: "agent" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid approval proposal/);
  const brief = JSON.parse(result.stdout);
  assert.equal(brief.actor, "agent");
  assert.equal(brief.payloadPreview, "");
  assert.ok(brief.errors.includes("missing payloadSummary"));
  for (const field of ["targetSystem", "action", "impact", "rollback", "approvalText"]) {
    assert.equal(brief[field], "");
  }
});

test("CLI markdown exposes validation errors for an incomplete proposal", () => {
  const result = runCli(["--format", "markdown"], { actor: "agent" });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /## Validation Errors/);
  assert.match(result.stdout, /- missing payloadSummary/);
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

test("classifies read and draft modes", () => {
  assert.equal(classifyRisk({ ...valid, mode: "read" }), "read-only");
  assert.equal(classifyRisk({ ...valid, mode: "draft" }), "draft-only");
});

test("blocks forbidden actions", () => {
  assert.throws(() => createBrief({ ...valid, action: "delete account" }), /Forbidden action/);
});

test("blocks policy-defined forbidden actions", () => {
  assert.throws(() => createBrief({ ...valid, action: "bulk invite users" }, { policy: "fixtures/policy.json" }), /Forbidden action/);
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
