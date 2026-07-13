#!/usr/bin/env bash
set -euo pipefail
npm test
npm run check
npm run build
npm run smoke >/tmp/skill-approval-brief-smoke.md
node ./bin/skill-approval-brief.js fixtures/write-action.json --policy fixtures/policy.json --format json >/tmp/skill-approval-brief-policy.json
test -s /tmp/skill-approval-brief-smoke.md
grep -q '"approval-ready"' /tmp/skill-approval-brief-policy.json
echo "validation passed"
