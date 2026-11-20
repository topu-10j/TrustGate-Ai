const instructionThreats = new Set(["PROMPT_INJECTION", "JAILBREAK"]);

export function shouldBlockChatScan(result) {
  return result.decision === "BLOCK" || (result.decision === "WARN" &&
    result.threats?.some((threat) => instructionThreats.has(threat)));
}

// This interface receives only already-authorized rows from the PostgreSQL query.
export async function groundedSources(rows, scanPrompt) {
  const checked = await Promise.all(rows.map(async (row) => {
    const result = await scanPrompt(row.title + "\n" + row.body);
    if (shouldBlockChatScan(result)) return null;
    const [title, ...body] = result.masked_prompt.split("\n");
    const text = body.join("\n").trim();
    if (!text) return null;
    return { id: row.id, title, text };
  }));
  return checked.filter(Boolean);
}

export function citedDocuments(sources) {
  return [...new Map(sources.map(({ id, title }) => [id, { id, title }])).values()];
}

export function followUpQuery(question, previous) {
  const genericFollowUp = /^(?:(?:tell me|explain)(?: a bit)? more\b|what about (?:it|that)\b|(?:ওটা|সেটা|ওইটা|আরও|আরো)(?:\s|[?.!]|$))/iu;
  return previous && genericFollowUp.test(question) ? (previous + " " + question).slice(0, 500) : question;
}

export function fallbackGroundedAnswer(sources) {
  return sources.slice(0, 2).map(({ text }) => text).join("\n\n").slice(0, 850);
}
