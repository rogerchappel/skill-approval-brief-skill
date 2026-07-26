# Examples

## Create a PR Approval Brief

```bash
skill-approval-brief fixtures/write-action.json --evidence fixtures/evidence.md --format markdown
```

## Enforce a Local Forbidden-Action Policy

```bash
skill-approval-brief fixtures/write-action.json --policy fixtures/policy.json --format json
```

## Short Payload Preview

```bash
skill-approval-brief fixtures/write-action.json --max-payload-chars 120 --format markdown
```

## Keep Mode Consistent with the Description

`mode` cannot downgrade a write described by `action` or `impact`. This proposal
is classified as `write-after-approval`, not `read-only`:

```json
{
  "actor": "triage agent",
  "targetSystem": "GitHub",
  "action": "create issue",
  "mode": "read",
  "payloadSummary": "Open one public issue.",
  "impact": "Creates a public GitHub issue.",
  "rollback": "Close the issue.",
  "approvalText": "Approve triage agent to create issue on GitHub."
}
```
