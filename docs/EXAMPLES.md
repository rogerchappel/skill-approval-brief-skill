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
affirmative lifecycle, access, collaboration, labeling, assignment, and locking
changes. Examples include `closing pull request`, `archives repository`,
`reopens issue`, `removed collaborator`, `adds label`, `assigning issue`, and
`locked conversation`. Repository and deployment mutations such as `forks
repository`, `committed changes`, `push branch`, and `deploying application`
are also writes, while `inspect forks`, `review commits`, `list branches`, and
`inspect deployments` remain read-only:

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
object whose existing state uses one of those words. The same distinction keeps
`inspect archived repositories`, `list assigned issues`, and `review labeled
pull requests` read-only:

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
