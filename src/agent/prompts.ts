import type { WorkNotes } from "./core.js";

export function createWorkNotesPrompt(taskDescription: string) {
  return `Based on the task: "${taskDescription}", generate structured work notes following this format:

Respond with ONLY a JSON object (no markdown, no code blocks):

{
  "intent": {
    "what": "What you're trying to do",
    "why": "Why this matters"
  },
  "hypothesis": {
    "expected": "Expected outcome",
    "metrics": ["metric 1", "metric 2"]
  },
  "plan": {
    "steps": ["step 1", "step 2", "step 3"],
    "alternatives": ["alternative 1", "alternative 2"],
    "rationale": "Why this approach"
  },
  "scope": {
    "files": ["file pattern 1", "file pattern 2"],
    "max_files": 5,
    "max_loc": 500
  },
  "assumptions": ["assumption 1", "assumption 2"],
  "risks": {
    "technical": ["risk 1"],
    "behavioral": ["risk 1"]
  },
  "status": "planning"
}`;
}

export function formatWorkNotesSummary(notes: WorkNotes) {
  return `## Work Notes Created

**Intent:** ${notes.intent.what}

**Plan:**
${notes.plan.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
}
