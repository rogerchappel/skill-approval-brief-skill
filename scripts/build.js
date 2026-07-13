import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["./bin/skill-approval-brief.js", "--help"], { encoding: "utf8" });
if (result.status !== 0 || !result.stdout.includes("skill-approval-brief")) {
  console.error(result.stderr || "build smoke failed");
  process.exit(1);
}
console.log("build passed");
