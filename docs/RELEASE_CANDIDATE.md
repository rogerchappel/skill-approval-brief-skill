# Release Candidate Notes

## Verification

- `npm test`
- `npm run check`
- `npm run build`
- `npm run smoke`
- `node ./bin/skill-approval-brief.js fixtures/write-action.json --policy fixtures/policy.json --format json`
- `bash scripts/validate.sh`

## Classification

ship

## Known Limitations

- Forbidden-action detection is phrase based.
- Evidence excerpts are capped and not semantically verified.
- The tool cannot prove that a later agent action matches the approved proposal.
