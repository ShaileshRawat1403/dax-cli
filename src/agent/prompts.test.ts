import { describe, expect, test } from "bun:test";
import { createWorkNotesPrompt, formatWorkNotesSummary } from "./prompts.js";

describe("agent prompts", () => {
  test("work notes prompt includes task and strict json instruction", () => {
    const prompt = createWorkNotesPrompt("Refactor auth middleware");
    expect(prompt.includes("Refactor auth middleware")).toBeTrue();
    expect(prompt.includes("Respond with ONLY a JSON object")).toBeTrue();
    expect(prompt.includes("\"scope\"")).toBeTrue();
    expect(prompt.includes("\"status\"")).toBeTrue();
  });

  test("summary formatter renders intent and ordered steps", () => {
    const text = formatWorkNotesSummary({
      intent: { what: "Do thing", why: "Because" },
      hypothesis: { expected: "Works", metrics: ["m1"] },
      plan: { steps: ["one", "two"], alternatives: ["alt"], rationale: "best" },
      scope: { files: ["src/*"], max_files: 2, max_loc: 10 },
      assumptions: ["a"],
      risks: { technical: ["t"], behavioral: ["b"] },
      status: "planning",
    });
    expect(text.includes("Intent")).toBeTrue();
    expect(text.includes("1. one")).toBeTrue();
    expect(text.includes("2. two")).toBeTrue();
  });
});
