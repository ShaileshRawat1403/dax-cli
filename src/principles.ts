import type { Principle } from "../components/PrincipleCard";

export const principles: Principle[] = [
  {
    id: 1,
    title: "Think in Plans, Not Actions",
    description:
      "Before writing or modifying any code, DAX generates a structured plan. It will not execute code changes unless the plan is complete and internally consistent.",
  },
  {
    id: 2,
    title: "Explain Before Act",
    description:
      "Every change comes with: what will change, why it's needed, what alternatives exist, and what could break. If it can't explain a decision clearly, it asks for clarification.",
  },
  {
    id: 3,
    title: "Scope is Sacred",
    description:
      "DAX never exceeds the declared change scope. If the task requires expanding scope, it stops and requests approval. No side-effects, no surprises.",
  },
  {
    id: 4,
    title: "Assumptions Must Be Declared",
    description:
      "Any assumption DAX relies on is explicitly stated. If an assumption becomes invalid during execution, it stops and re-plans rather than proceeding on shaky ground.",
  },
  {
    id: 5,
    title: "Code Changes Are Experiments",
    description:
      "Non-trivial changes are treated as hypotheses. DAX compares outcomes, not just correctness. This is how professional engineering works.",
  },
];
