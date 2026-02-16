// /Users/Shailesh/MYAIAGENTS/my-cog-nito/src/types.ts

/**
 * The canonical, unified data structure for a single unit of work.
 * This is the "Single Source of Truth" for what the agent is thinking and doing.
 */
export interface WorkNote {
  id: string;
  created: string;
  status:
    | "pending"
    | "in_progress"
    | "awaiting_approval"
    | "completed"
    | "failed";

  // The user's original request
  intent: {
    what: string; // "Refactor auth middleware"
    why: string; // "Enterprise needs session support"
  };

  // The agent's proposed theory of success
  hypothesis: {
    expected: string; // "Dual auth with zero JWT regression"
    metrics: string[]; // ["All 47 tests pass", "Latency < +5ms"]
  };

  // The agent's step-by-step execution plan
  plan: {
    steps: string[];
    alternatives: string[];
    rationale: string; // "Strategy pattern preserves existing code and is easier to test"
  };

  // The boundaries for the agent's work
  scope: {
    files: string[]; // ["src/auth/*"]
    max_files: number;
    max_loc: number;
  };

  // Things the agent believes to be true to proceed
  assumptions: string[]; // ["Redis available for session storage"]

  // Potential problems the agent has identified
  risks: {
    technical: string[]; // ["Session fixation"]
    behavioral: string[]; // ["Set-Cookie header changes might affect clients"]
  };

  // The concrete output of the work
  changes?: {
    files_modified: string[];
    behavior_changes: string[];
  };

  // How the agent will verify its work
  tests?: {
    intent: string;
    scenarios: string[];
    invariants: string[];
  };
}

export interface WorkNotesResponse {
  notes: WorkNote[];
}

export interface Decision {
  id: string;
  timestamp: string;
  context: string;
  decision: string;
  rationale: string;
  alternatives: {
    name: string;
    reason_rejected: string;
  }[];
  confidence: "high" | "medium" | "low";
  reversible: boolean;
}

export interface ExperimentVariant {
  label: string;
  description: string;
  metrics: Record<string, string>;
}

export interface Experiment {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  variant_a: ExperimentVariant;
  variant_b: ExperimentVariant;
  deltas: Record<string, string>;
  verdict: string;
}

export interface DecisionsResponse {
  decisions: Decision[];
}

export interface ExperimentsResponse {
  experiments: Experiment[];
}
