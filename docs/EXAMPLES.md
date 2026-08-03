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
is classified as `write-after-approval`, not `read-only`. The same rule covers
affirmative variants of `close`, `rename`, and `invite`, such as `closing pull
request`, `renames repository`, and `invited collaborator`:

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

A genuinely read-only action remains `read-only`, even when it describes an
object whose existing state uses one of those words:

```json
{
  "actor": "triage agent",
  "targetSystem": "GitHub",
  "action": "inspect closed pull requests",
  "mode": "read",
  "payloadSummary": "List pull requests that are already closed.",
  "impact": "Read-only inspection with no external write.",
  "rollback": "No rollback is needed.",
  "approvalText": "Approve triage agent to inspect closed pull requests on GitHub."
}
```
