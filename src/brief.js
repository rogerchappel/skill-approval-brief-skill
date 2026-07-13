import fs from "node:fs";
import path from "node:path";

const REQUIRED_FIELDS = ["actor", "targetSystem", "action", "payloadSummary", "impact", "rollback", "approvalText"];
const FORBIDDEN_ACTIONS = ["delete account", "send payment", "publish secret", "disable security"];
const REDACT_KEYS = ["token", "secret", "password", "apiKey", "authorization"];

export function createBrief(proposal, options = {}) {
  const errors = validateProposal(proposal);
  const risk = classifyRisk(proposal);
  const payloadPreview = redactAndTruncate(proposal.payload ?? proposal.payloadSummary, options);
  const brief = {
    status: risk === "forbidden" ? "blocked" : "approval-ready",
    risk,
    actor: proposal.actor,
    targetSystem: proposal.targetSystem,
    action: proposal.action,
    impact: proposal.impact,
    rollback: proposal.rollback,
    approvalText: proposal.approvalText,
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
  if (proposal.approvalText && isVagueApproval(proposal.approvalText)) {
    errors.push("approvalText must name the action and target explicitly");
  }
  return errors;
}

export function classifyRisk(proposal) {
  const haystack = `${proposal.action ?? ""} ${proposal.impact ?? ""}`.toLowerCase();
  if (FORBIDDEN_ACTIONS.some((phrase) => haystack.includes(phrase))) return "forbidden";
  if (proposal.mode === "read" || haystack.includes("read-only")) return "read-only";
  if (proposal.mode === "draft" || haystack.includes("draft-only")) return "draft-only";
  return "write-after-approval";
}

function isVagueApproval(text) {
  const normalized = text.toLowerCase();
  if (normalized.length < 24) return true;
  return ["ok", "yes", "approve", "go ahead"].includes(normalized.trim());
}

function redactAndTruncate(value, options) {
  const max = Number(options.maxPayloadChars ?? 500);
  const redacted = redactValue(value, new Set([...(options.redactKeys ?? []), ...REDACT_KEYS]));
  const text = typeof redacted === "string" ? redacted : JSON.stringify(redacted, null, 2);
  return text.length > max ? `${text.slice(0, max)}... [truncated]` : text;
}

function redactValue(value, keys) {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, keys));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      keys.has(key) ? "[REDACTED]" : redactValue(child, keys)
    ]));
  }
  return value;
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
