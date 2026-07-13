import assert from "node:assert/strict";
import fs from "node:fs";
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
  approvalText: "Approve release agent to create a GitHub PR for run artifact index."
};

test("creates approval-ready brief for valid write action", () => {
  const brief = createBrief(valid);
  assert.equal(brief.status, "approval-ready");
  assert.equal(brief.risk, "write-after-approval");
  assert.match(brief.payloadPreview, /REDACTED/);
});

test("reports missing required fields", () => {
  const errors = validateProposal({ actor: "agent" });
  assert.ok(errors.includes("missing targetSystem"));
});

test("rejects vague approval text", () => {
  const errors = validateProposal({ ...valid, approvalText: "ok" });
  assert.ok(errors.some((error) => error.includes("approvalText")));
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
