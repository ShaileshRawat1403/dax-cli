import { describe, expect, test } from "bun:test";
import { createWorkNotesPrompt, formatWorkNotesSummary } from "./prompts.js";

describe("agent prompts", () => {
  test("work notes prompt includes task and strict json instruction", () => {
    const prompt = createWorkNotesPrompt("Refactor auth middleware");
    expect(prompt.includes("Refactor auth middleware")).toBeTrue();
    expect(prompt.includes("Respond with ONLY valid JSON")).toBeTrue();
    expect(prompt.includes("\"scope\"")).toBeTrue();
    expect(prompt.includes("\"status\"")).toBeTrue();
  });

  test("summary formatter renders intent and steps", () => {
    const text = formatWorkNotesSummary({
      intent: { what: "Do thing", why: "Because" },
      hypothesis: { expected: "Works", metrics: ["m1"] },
      plan: { steps: ["one", "two"], alternatives: ["alt"], rationale: "best" },
      scope: { files: ["src/*"], max_files: 2, max_loc: 10 },
      assumptions: ["a"],
      risks: { technical: ["t"], behavioral: ["b"] },
      status: "planning",
    });
    expect(text.includes("Do thing")).toBeTrue();
    expect(text.includes("one → two")).toBeTrue();
  });
});
