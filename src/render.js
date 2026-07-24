export function renderJson(brief) {
  return `${JSON.stringify(brief, null, 2)}\n`;
}

export function renderMarkdown(brief) {
  const lines = [
    "# Approval Brief",
    "",
    `Status: ${brief.status}`,
    `Risk: ${brief.risk}`,
    `Actor: ${brief.actor}`,
    `Target system: ${brief.targetSystem}`,
    `Action: ${brief.action}`,
    "",
    "## Impact",
    "",
    brief.impact,
    "",
    "## Rollback",
    "",
    brief.rollback,
    "",
    "## Exact Approval Text",
    "",
    `> ${brief.approvalText}`,
    "",
    "## Payload Preview",
    "",
    "```",
    brief.payloadPreview,
    "```"
  ];

  if (brief.evidence.length > 0) {
    lines.push("", "## Evidence", "");
    for (const item of brief.evidence) {
      lines.push(`- \`${item.path}\``);
      lines.push(`  ${item.excerpt.replace(/\n/g, " ").trim()}`);
    }
  }

  if (brief.errors.length > 0) {
    lines.push("", "## Validation Errors", "");
    for (const error of brief.errors) lines.push(`- ${error}`);
  }

  return `${lines.join("\n")}\n`;
}
