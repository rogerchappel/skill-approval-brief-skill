# skill-approval-brief-skill

`skill-approval-brief-skill` is a local-first CLI and agent skill for converting a proposed external action into a concise approval brief. It helps agents ask for permission with target system, impact, rollback, evidence, risk, and exact approval wording.

## Quickstart

```bash
npm install
npm run smoke
node ./bin/skill-approval-brief.js fixtures/write-action.json --evidence fixtures/evidence.md --format json
```

## Proposal Shape

```json
{
  "actor": "release agent",
  "targetSystem": "GitHub",
  "action": "create release-candidate pull request",
  "payloadSummary": "Open a PR with verification notes.",
  "impact": "Creates a review branch; does not merge.",
  "rollback": "Close the PR and delete the branch.",
  "approvalText": "Approve release agent to create a GitHub PR for this repo."
}
```

## CLI

```bash
skill-approval-brief proposal.json \
  --evidence evidence.md \
  --format json|markdown \
  --output approval.md \
  --max-payload-chars 500 \
  --redact-key customerEmail
```

## Risk Levels

- `read-only`: inspection with no external write.
- `draft-only`: creates drafts or local plans only.
- `write-after-approval`: may write externally after explicit approval.
- `forbidden`: too destructive or sensitive for approval prompting.

## Safety Notes

- Never calls external services.
- Does not perform the proposed action.
- Redacts common secret keys in payload previews.
- Returns non-zero for forbidden actions and invalid proposals.
