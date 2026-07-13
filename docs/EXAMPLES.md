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
