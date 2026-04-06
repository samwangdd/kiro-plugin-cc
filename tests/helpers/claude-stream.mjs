export function parseClaudeStream(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function collectToolUses(events) {
  return events.flatMap((event) => {
    const content = event?.message?.content;
    if (!Array.isArray(content)) {
      return [];
    }

    return content
      .filter((item) => item?.type === "tool_use")
      .map((item) => ({
        eventType: event.type,
        name: item.name,
        input: item.input || {}
      }));
  });
}

export function findForbiddenToolUses(events, forbiddenNames) {
  const forbidden = new Set(forbiddenNames);
  return collectToolUses(events).filter((item) => forbidden.has(item.name));
}

export function findKeyBashCommands(events) {
  return collectToolUses(events)
    .filter((item) => item.name === "Bash")
    .map((item) => item.input.command)
    .filter((command) => typeof command === "string" && command.includes("kiro-companion.mjs"))
    .filter((command) => command.includes(" rescue "));
}
