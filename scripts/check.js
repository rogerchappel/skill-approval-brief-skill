import fs from "node:fs";

const required = ["README.md", "SKILL.md", "docs/PRD.md", "docs/TASKS.md", "docs/ORCHESTRATION.md", "docs/PROPOSAL_SCHEMA.json", "docs/POLICY_SCHEMA.json", "docs/OUTPUT_SCHEMA.json"];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(`Missing required files: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("check passed");
