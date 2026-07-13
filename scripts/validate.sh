#!/usr/bin/env bash
set -euo pipefail
npm test
npm run check
npm run build
npm run smoke >/tmp/skill-approval-brief-smoke.md
test -s /tmp/skill-approval-brief-smoke.md
echo "validation passed"
