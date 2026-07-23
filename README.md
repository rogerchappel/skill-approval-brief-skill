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
  "approvalText": "Approve release agent to create release-candidate pull request on GitHub for this repo."
}
```

## CLI

```bash
skill-approval-brief proposal.json \
  --evidence evidence.md \
  --format json|markdown \
  --output approval.md \
  --policy policy.json \
  --max-payload-chars 500 \
  --redact-key customerEmail
```

Policy files may add local forbidden phrases. `forbiddenActions`, when present, must
be an array of non-empty strings; other value types and blank entries are rejected
before the proposal is classified. The complete schema is in
[`docs/POLICY_SCHEMA.json`](docs/POLICY_SCHEMA.json).

```json
{
  "forbiddenActions": ["bulk invite users"]
}
```

## Risk Levels

- `read-only`: inspection with no external write.
- `draft-only`: creates drafts or local plans only.
- `write-after-approval`: may write externally after explicit approval.
- `forbidden`: too destructive or sensitive for approval prompting.

## Safety Notes

- Never calls external services.
- Does not perform the proposed action.
- Requires the complete action and target-system phrases in approval text after case folding and normalization of punctuation and whitespace. Partial words and abbreviations do not match.
- Redacts common secret keys in payload previews.
- Returns non-zero for forbidden actions and invalid proposals.
