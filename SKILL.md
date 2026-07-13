# Skill Approval Brief Skill

Use this skill before an agent asks a human to approve an external side effect such as creating a PR, sending a message, updating CRM, changing project-management data, or posting content.

## Required Inputs

- JSON proposal with actor, target system, action, payload summary, impact, rollback, and exact approval text.
- Optional evidence files that support the request.

## Side-Effect Boundaries

- This skill never performs the action.
- It only reads local proposal and evidence files.
- It may write a local brief when `--output` is provided.
- Forbidden actions should be redesigned or escalated, not approved through this skill.

## Workflow

1. Prepare a proposal JSON file.
2. Run `skill-approval-brief proposal.json --format markdown`.
3. Review risk, impact, rollback, and payload preview.
4. Ask the human using the exact approval text only after the brief is complete.
5. Keep the generated brief with the run audit trail.

## Verification

Run:

```bash
npm test
npm run smoke
bash scripts/validate.sh
```

## Example

```bash
skill-approval-brief fixtures/write-action.json --evidence fixtures/evidence.md --format markdown
```
