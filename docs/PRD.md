# skill-approval-brief-skill PRD

## Summary

Build a local-first agent skill that turns a proposed external action into a concise approval brief with scope, evidence, rollback, risk level, and exact user decision text.

## MVP

- CLI accepts a JSON action proposal and optional evidence paths.
- Validates actor, target system, action, payload summary, impact, rollback, and approval text.
- Classifies risk as read-only, draft-only, write-after-approval, or forbidden.
- Emits markdown and JSON approval briefs.
- Includes approval-boundary skill instructions and examples.

## Non-Goals

- No connector writes.
- No remote API calls.
- No automatic approval inference.

## Success Criteria

- Fixture-backed tests cover valid briefs, missing fields, forbidden actions, truncation, and redaction.
- CLI smoke emits markdown suitable for a human approval request.
- Forbidden actions produce a blocked brief and non-zero exit.
