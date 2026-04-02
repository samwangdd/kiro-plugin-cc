import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, readText } from "./fs.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function extractJsonBlock(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Could not find JSON object in Kiro review output.");
  }
  return text.slice(firstBrace, lastBrace + 1);
}

export async function loadReviewAssets() {
  const template = await readText(path.join(ROOT_DIR, "prompts", "review.md"));
  const schema = await readJson(path.join(ROOT_DIR, "schemas", "review-output.schema.json"));
  return { template, schema };
}

export function buildReviewPrompt({ template, schema, handoffText, reviewContext }) {
  return template
    .replace("{{REVIEW_SCHEMA}}", JSON.stringify(schema, null, 2))
    .replace("{{TARGET_LABEL}}", reviewContext.target.label)
    .replace("{{HANDOFF_CONTEXT}}", handoffText.trim() || "No handoff available.")
    .replace("{{REVIEW_INPUT}}", reviewContext.content || "No diff available.");
}

export function buildRescuePrompt({ taskText, handoffText }) {
  return [
    "You are Kiro acting as a rescue worker for Claude Code.",
    "",
    "<handoff>",
    handoffText.trim() || "No handoff available.",
    "</handoff>",
    "",
    "<task>",
    taskText.trim(),
    "</task>"
  ].join("\n");
}

export function parseReviewOutput(stdout, schema) {
  const parsed = JSON.parse(extractJsonBlock(stdout));
  const required = (schema && schema.required) || [];
  for (const key of required) {
    if (!(key in parsed)) {
      throw new Error(`Missing required field: ${key}`);
    }
  }
  return parsed;
}
