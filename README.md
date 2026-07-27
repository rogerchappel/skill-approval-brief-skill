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

Exactly one proposal path is accepted. `--max-payload-chars` must be a positive
integer; all value-taking options fail with an actionable error when their
value is absent.

Policy files may add local forbidden phrases. `forbiddenActions`, when present, must
be an array of non-empty strings; other value types and blank entries are rejected
before the proposal is classified. Policy roots must be objects and unknown
properties are rejected. The complete schema is in
[`docs/POLICY_SCHEMA.json`](docs/POLICY_SCHEMA.json).
Forbidden phrases are case-insensitive and punctuation-insensitive, and match only
at normalized token boundaries. For example, `delete account` matches
`DELETE—ACCOUNT`, but does not match `delete accountancy notes`.

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

`mode` is a classification hint, not an override for `action` and `impact`.
Classification uses conservative precedence: forbidden actions remain `forbidden`,
then write semantics (including `mode: "write"`) become `write-after-approval`,
then consistent draft and read descriptions become `draft-only` or `read-only`.
For example, `mode: "read"` combined with `action: "create issue"` is classified
as `write-after-approval`. Keep all three fields consistent so reviewers see an
unambiguous boundary.

## Safety Notes

- Never calls external services.
- Does not perform the proposed action.
- Requires the complete action and target-system phrases in approval text after case folding and normalization of punctuation and whitespace. Partial words and abbreviations do not match.
- Redacts common secret keys in payload previews.
- Invalid proposals emit an `invalid` / `unclassified` schema-backed brief in the
  selected format, including an `errors` array in JSON or a **Validation Errors**
  section in Markdown, and exit 1. Required proposal fields must be non-empty
  strings, and `mode`, when present, must be `read`, `draft`, or `write`. A
  schema-valid mode that contradicts write semantics is conservatively elevated
  rather than trusted.
- Forbidden actions emit a blocked brief and retain their distinct exit 2
  status.
