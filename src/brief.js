import fs from "node:fs";
import path from "node:path";

const REQUIRED_FIELDS = ["actor", "targetSystem", "action", "payloadSummary", "impact", "rollback", "approvalText"];
const FORBIDDEN_ACTIONS = ["delete account", "send payment", "publish secret", "disable security"];
const REDACT_KEYS = ["token", "secret", "password", "apiKey", "authorization"];
const WRITE_VERBS = /\b(?:creat(?:e|es|ed|ing)|updat(?:e|es|ed|ing)|edit(?:s|ed|ing)?|delet(?:e|es|ed|ing)|send(?:s|ing)?|sent|publish(?:es|ed|ing)?|post(?:s|ed|ing)?|upload(?:s|ed|ing)?|modif(?:y|ies|ied|ying)|merg(?:e|es|ed|ing)|writ(?:e|es|ten|ing))\b/i;
const MUTATING_ACTION_VERBS = /^(?:clos(?:e|es|ed|ing)|renam(?:e|es|ed|ing)|invit(?:e|es|ed|ing))\b/i;

export function createBrief(proposal, options = {}) {
  const forbiddenActions = [...FORBIDDEN_ACTIONS, ...loadPolicy(options.policy).forbiddenActions];
  const errors = validateProposal(proposal);
  const validRoot = isPlainObject(proposal);
  const risk = errors.length > 0 ? "unclassified" : classifyRisk(proposal, forbiddenActions);
  const payloadPreview = redactAndTruncate(validRoot ? proposal.payload ?? proposal.payloadSummary : undefined, options);
  const brief = {
    status: errors.length > 0 ? "invalid" : risk === "forbidden" ? "blocked" : "approval-ready",
    risk,
    actor: validRoot && typeof proposal.actor === "string" ? proposal.actor : "",
    targetSystem: validRoot && typeof proposal.targetSystem === "string" ? proposal.targetSystem : "",
    action: validRoot && typeof proposal.action === "string" ? proposal.action : "",
    impact: validRoot && typeof proposal.impact === "string" ? proposal.impact : "",
    rollback: validRoot && typeof proposal.rollback === "string" ? proposal.rollback : "",
    approvalText: validRoot && typeof proposal.approvalText === "string" ? proposal.approvalText : "",
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
  if (!isPlainObject(proposal)) return ["proposal must be an object"];

  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (typeof proposal[field] !== "string" || proposal[field].trim() === "") {
      errors.push(`${field} must be a non-empty string`);
    }
  }
  if (proposal.mode !== undefined && !["read", "draft", "write"].includes(proposal.mode)) {
    errors.push("mode must be one of: read, draft, write");
  }
  if (
    typeof proposal.approvalText === "string"
    && proposal.approvalText.trim() !== ""
    && !isScopedApproval(proposal.approvalText, proposal.action, proposal.targetSystem)
  ) {
    errors.push("approvalText must name the action and target explicitly");
  }
  return errors;
}

export function classifyRisk(proposal, forbiddenActions = FORBIDDEN_ACTIONS) {
  const haystack = `${proposal.action ?? ""} ${proposal.impact ?? ""}`;
  if (forbiddenActions.some((phrase) => containsNormalizedPhrase(haystack, phrase))) return "forbidden";
  if (proposal.mode === "write" || describesWrite(proposal)) return "write-after-approval";
  if (proposal.mode === "read" || haystack.toLowerCase().includes("read-only")) return "read-only";
  if (proposal.mode === "draft" || haystack.toLowerCase().includes("draft-only")) return "draft-only";
  return "write-after-approval";
}

function describesWrite(proposal) {
  const action = String(proposal.action ?? "").trim();
  const description = `${action} ${proposal.impact ?? ""}`
    .replace(/\bno external writes?\b/gi, "")
    .replace(/\bnothing is (?:published|posted|uploaded|updated|created|written)\b/gi, "");
  return /\bwrite-after-approval\b/i.test(description)
    || WRITE_VERBS.test(description)
    || MUTATING_ACTION_VERBS.test(action);
}

function loadPolicy(policyPath) {
  if (!policyPath) return { forbiddenActions: [] };
  const parsed = JSON.parse(fs.readFileSync(path.resolve(policyPath), "utf8"));
  if (!isPlainObject(parsed)) {
    throw new TypeError("Policy must be an object.");
  }
  const unexpected = Object.keys(parsed).filter((key) => key !== "forbiddenActions").sort();
  if (unexpected.length > 0) {
    throw new TypeError(`Policy contains unexpected properties: ${unexpected.join(", ")}.`);
  }
  const forbiddenActions = parsed.forbiddenActions;
  if (
    forbiddenActions === undefined
    || !Array.isArray(forbiddenActions)
    || forbiddenActions.some((phrase) => typeof phrase !== "string" || phrase.trim() === "")
  ) {
    if (forbiddenActions === undefined) {
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

function containsNormalizedPhrase(value, phrase) {
  const normalizedPhrase = normalizePhrase(phrase);
  if (!normalizedPhrase) return false;
  return ` ${normalizePhrase(value)} `.includes(` ${normalizedPhrase} `);
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
