# Orchestration

## Agent Flow

1. Draft the action proposal locally.
2. Attach evidence files for why the action is needed.
3. Run the CLI and inspect the generated brief.
4. Present the exact approval text with the brief.
5. Perform the external action only after explicit approval through the host system.

## Approval Boundary

This tool prepares approval requests; it is not approval. A passing brief does not authorize any external write.

## Failure Handling

- Missing fields: update the proposal before asking the user.
- Vague approval text: rewrite it with actor, action, and target system.
- Forbidden action: block the action and design a safer alternative.
