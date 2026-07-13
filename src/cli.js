import fs from "node:fs";
import { createBrief } from "./brief.js";
import { renderJson, renderMarkdown } from "./render.js";

export async function runCli(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  try {
    const proposal = JSON.parse(fs.readFileSync(options.input, "utf8"));
    const brief = createBrief(proposal, options);
    const output = options.format === "json" ? renderJson(brief) : renderMarkdown(brief);
    writeOutput(output, options.output);
  } catch (error) {
    if (error.brief) {
      const output = options.format === "json" ? renderJson(error.brief) : renderMarkdown(error.brief);
      writeOutput(output, options.output);
    }
    throw error;
  }
}

export function parseArgs(argv) {
  const options = { format: "json", evidence: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--format") options.format = readValue(argv, ++index, "--format");
    else if (arg === "--output") options.output = readValue(argv, ++index, "--output");
    else if (arg === "--evidence") options.evidence.push(readValue(argv, ++index, "--evidence"));
    else if (arg === "--policy") options.policy = readValue(argv, ++index, "--policy");
    else if (arg === "--max-payload-chars") options.maxPayloadChars = readValue(argv, ++index, "--max-payload-chars");
    else if (arg === "--redact-key") options.redactKeys = [...(options.redactKeys ?? []), readValue(argv, ++index, "--redact-key")];
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else options.input = arg;
  }
  if (!options.help && !options.input) throw new Error("input proposal JSON is required");
  if (!["json", "markdown"].includes(options.format)) throw new Error("--format must be json or markdown");
  return options;
}

function readValue(argv, index, name) {
  if (!argv[index]) throw new Error(`${name} requires a value`);
  return argv[index];
}

function writeOutput(output, outputPath) {
  if (outputPath) fs.writeFileSync(outputPath, output);
  else process.stdout.write(output);
}

function helpText() {
  return `skill-approval-brief proposal.json [--evidence file] [--format json|markdown]\n\nCreates an approval brief without performing the proposed action.\n`;
}
