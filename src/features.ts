import type { Feature } from "../components/FeatureCard";

export const features: Feature[] = [
  {
    icon: "fas fa-clipboard-list",
    title: "Structured Work Notes",
    description:
      "Every task gets a mandatory work notes structure: intent, hypothesis, plan, scope, assumptions, risks, changes, tests, metrics, and decision log.",
  },
  {
    icon: "fas fa-lock",
    title: "Sacred Scope",
    description:
      "Declare your scope. Lock it. If the agent needs to exceed it, it stops and asks. No more surprise changes to files you didn't authorize.",
  },
  {
    icon: "fas fa-flask",
    title: "Experimentation Mode",
    description:
      "Compare Variant A vs Variant B with identical tests. See deltas clearly. The agent never silently replaces your baseline.",
  },
  {
    icon: "fas fa-file-contract",
    title: "Repo Contracts",
    description:
      "Define your project's rules: error handling, test conventions, forbidden APIs. DAX validates all output against them.",
  },
  {
    icon: "fas fa-puzzle-piece",
    title: "Partial Acceptance",
    description:
      "Accept the plan but reject the code. Keep tests but discard the refactor. Request a smaller diff. Outputs are separated into PLAN, CODE, TESTS, METRICS.",
  },
  {
    icon: "fas fa-stop-circle",
    title: "Fail-Safe Behavior",
    description:
      "If scope is exceeded, assumptions fail, metrics regress, or tests contradict intent: the agent STOPS and explains. Never continues autonomously.",
  },
];
