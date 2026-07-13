# Release Candidate PR Body

## Summary

- Adds a local-first approval brief CLI for proposed external actions.
- Validates required proposal fields and explicit approval text.
- Classifies risk and blocks forbidden destructive actions without calling external services.

## Verification

- `npm test` - pass
- `npm run check` - pass
- `npm run build` - pass
- `npm run smoke` - pass
- `bash scripts/validate.sh` - pass

## Classification

ship
