import fs from "node:fs";
import path from "node:path";

const REQUIRED_FIELDS = ["actor", "targetSystem", "action", "payloadSummary", "impact", "rollback", "approvalText"];
const FORBIDDEN_ACTIONS = ["delete account", "send payment", "publish secret", "disable security"];
const REDACT_KEYS = ["token", "secret", "password", "apiKey", "authorization"];

export function createBrief(proposal, options = {}) {
  const forbiddenActions = [...FORBIDDEN_ACTIONS, ...loadPolicy(options.policy).forbiddenActions];
  const errors = validateProposal(proposal);
  const risk = classifyRisk(proposal, forbiddenActions);
  const payloadPreview = redactAndTruncate(proposal.payload ?? proposal.payloadSummary, options);
  const brief = {
    status: risk === "forbidden" ? "blocked" : "approval-ready",
    risk,
    actor: stringValue(proposal.actor),
    targetSystem: stringValue(proposal.targetSystem),
    action: stringValue(proposal.action),
    impact: stringValue(proposal.impact),
    rollback: stringValue(proposal.rollback),
    approvalText: stringValue(proposal.approvalText),
    payloadPreview,
    evidence: loadEvidence(options.evidence ?? []),
    errors
  };
  if (risk === "forbidden") {
    const error = new Error("Forbidden action requires redesign, not approval.");
    error.code = "BLOCKED_ACTION";
    error.brief = brief;
    throw error;
  }
  if (errors.length > 0) {
    const error = new Error(`Invalid approval proposal: ${errors.join("; ")}`);
    error.brief = brief;
    throw error;
  }
  return brief;
}

export function validateProposal(proposal) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!proposal[field] || String(proposal[field]).trim() === "") {
      errors.push(`missing ${field}`);
    }
  }
  if (proposal.approvalText && !isScopedApproval(proposal.approvalText, proposal.action, proposal.targetSystem)) {
    errors.push("approvalText must name the action and target explicitly");
  }
  return errors;
}

export function classifyRisk(proposal, forbiddenActions = FORBIDDEN_ACTIONS) {
  const haystack = `${proposal.action ?? ""} ${proposal.impact ?? ""}`.toLowerCase();
  if (forbiddenActions.some((phrase) => haystack.includes(String(phrase).toLowerCase()))) return "forbidden";
  if (proposal.mode === "read" || haystack.includes("read-only")) return "read-only";
  if (proposal.mode === "draft" || haystack.includes("draft-only")) return "draft-only";
  return "write-after-approval";
}

function loadPolicy(policyPath) {
  if (!policyPath) return { forbiddenActions: [] };
  const parsed = JSON.parse(fs.readFileSync(path.resolve(policyPath), "utf8"));
  const forbiddenActions = parsed?.forbiddenActions;
  if (
    forbiddenActions === undefined
    || !Array.isArray(forbiddenActions)
    || forbiddenActions.some((phrase) => typeof phrase !== "string" || phrase.trim() === "")
  ) {
    if (forbiddenActions === undefined && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { forbiddenActions: [] };
    }
    throw new TypeError("Policy forbiddenActions must be an array of non-empty strings.");
  }
  return { forbiddenActions };
}

function isScopedApproval(text, action, targetSystem) {
  if (!action || !targetSystem) return false;
  const normalizedText = ` ${normalizePhrase(text)} `;
  return [action, targetSystem].every((value) => {
    const phrase = normalizePhrase(value);
    return phrase && normalizedText.includes(` ${phrase} `);
  });
}

function normalizePhrase(value) {
  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function redactAndTruncate(value, options) {
  const max = Number(options.maxPayloadChars ?? 500);
  const redacted = redactValue(value, new Set(
    [...(options.redactKeys ?? []), ...REDACT_KEYS].map(normalizeRedactKey)
  ));
  const text = redacted === undefined
    ? ""
    : typeof redacted === "string" ? redacted : JSON.stringify(redacted, null, 2);
  return text.length > max ? `${text.slice(0, max)}... [truncated]` : text;
}

function stringValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function redactValue(value, keys) {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, keys));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      isRedactedKey(key, keys) ? "[REDACTED]" : redactValue(child, keys)
    ]));
  }
  return value;
}

function normalizeRedactKey(key) {
  return String(key).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRedactedKey(key, redactKeys) {
  const normalized = normalizeRedactKey(key);
  return [...redactKeys].some((redactKey) => normalized === redactKey || normalized.endsWith(redactKey));
}

function loadEvidence(paths) {
  return paths.map((evidencePath) => {
    const absolute = path.resolve(evidencePath);
    return {
      path: evidencePath,
      excerpt: fs.readFileSync(absolute, "utf8").slice(0, 300)
    };
  });
}
