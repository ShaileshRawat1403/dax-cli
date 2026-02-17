import type { WorkNotes } from "./core.js";

export function createWorkNotesPrompt(taskDescription: string) {
  return `Task: "${taskDescription}"

Create work notes. Respond with ONLY valid JSON:

{
  "intent": { "what": "one sentence", "why": "why it matters" },
  "hypothesis": { "expected": "expected outcome", "metrics": ["metric"] },
  "plan": { "steps": ["step 1", "step 2"], "rationale": "why this way" },
  "scope": { "files": ["*.ts"], "max_files": 5, "max_loc": 500 },
  "assumptions": ["assumption"],
  "risks": { "technical": [], "behavioral": [] },
  "status": "planning"
}`;
}

export function formatWorkNotesSummary(notes: WorkNotes) {
  return `📋 ${notes.intent.what}

→ ${notes.plan.steps.join(" → ")}`;
}
