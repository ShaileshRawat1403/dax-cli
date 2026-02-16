import { getDb, initDb } from "./db/index";
import * as schema from "./db/schema";

// We moved the mock data from `data.ts` to here.

const MOCK_WORK_NOTES = [
  {
    id: "wn-001",
    created: "2026-02-09T10:00:00Z",
    intent: {
      what: "Refactor authentication middleware to support JWT and session-based auth",
      why: "Current system only supports JWT, but enterprise clients need session support",
    },
    hypothesis: {
      expected: "Dual auth support with zero regression on existing JWT flow",
      metrics: [
        "All 47 auth tests pass",
        "No latency increase > 5ms",
        "Session cleanup < 100ms",
      ],
    },
    plan: {
      steps: [
        "Create AuthStrategy interface",
        "Implement JWTStrategy (extract from current)",
        "Implement SessionStrategy",
        "Add strategy resolver middleware",
        "Update route guards",
      ],
      alternatives: ["Passport.js adapter", "Separate auth endpoints"],
      rationale:
        "Strategy pattern keeps existing code intact while adding extensibility",
    },
    scope: {
      files: ["src/auth/*", "src/middleware/guard.ts"],
      max_files: 6,
      max_loc: 200,
    },
    assumptions: [
      "Redis is available for session storage",
      "Existing JWT tokens remain valid during migration",
      "No breaking changes to /api/auth/* responses",
    ],
    risks: {
      technical: [
        "Session fixation if not properly regenerated",
        "Memory leak if sessions not cleaned",
      ],
      behavioral: ["Existing clients may need to handle Set-Cookie headers"],
    },
    status: "in_progress",
  },
];

const MOCK_DECISIONS = [
  {
    id: "dec-001",
    timestamp: "2026-02-09T10:30:00Z",
    context: "Authentication refactor - choosing auth strategy pattern",
    decision: "Strategy pattern over middleware chain",
    rationale:
      "Strategy pattern allows runtime selection and is easier to test in isolation",
    alternatives: [
      {
        name: "Middleware chain",
        reason_rejected: "Order-dependent, harder to test",
      },
      {
        name: "Passport.js",
        reason_rejected: "Heavy dependency, most features unused",
      },
    ],
    confidence: "high",
    reversible: true,
  },
];

const MOCK_EXPERIMENTS = [
  {
    id: "exp-001",
    name: "Auth middleware performance comparison",
    status: "completed",
    variant_a: {
      label: "Baseline (JWT only)",
      description: "Current production JWT middleware",
      metrics: {
        avg_latency: "12ms",
        p99_latency: "45ms",
        memory: "2.1MB",
        tests_passed: "47/47",
      },
    },
    variant_b: {
      label: "Proposed (Strategy pattern)",
      description: "New dual-auth with strategy resolver",
      metrics: {
        avg_latency: "14ms",
        p99_latency: "48ms",
        memory: "2.3MB",
        tests_passed: "52/52",
      },
    },
    deltas: {
      avg_latency: "+2ms (+16.7%)",
      p99_latency: "+3ms (+6.7%)",
      memory: "+0.2MB (+9.5%)",
      tests_passed: "+5 new tests",
    },
    verdict:
      "Acceptable regression. +2ms avg latency is within budget. 5 new tests improve coverage.",
  },
];

const MOCK_CONTRACTS = {
  error_handling: {
    rules: [
      "Use Result<T, E> pattern, never throw",
      "All errors must have error codes",
      "Log at boundary, not at source",
    ],
    enforced: true,
  },
  test_conventions: {
    rules: [
      "No mocks - use real implementations",
      "Test behavior, not implementation",
      "Minimum 80% branch coverage",
    ],
    enforced: true,
  },
  forbidden_patterns: {
    rules: [
      "No any types",
      "No console.log in production",
      "No synchronous file I/O",
      "No default exports in library code",
    ],
    enforced: true,
  },
  architecture: {
    rules: [
      "Dependency injection only",
      "No circular imports",
      "Maximum 3 levels of nesting",
    ],
    enforced: true,
  },
};

async function main() {
  const shouldSeed = (process.env.DAX_SEED_DATA || process.env.COGNITO_SEED_DATA || "true") !== "false"
  
  if (!shouldSeed) {
    console.log("⏭️  Skipping seed (DAX_SEED_DATA=false, legacy COGNITO_SEED_DATA=false)")
    return
  }

  console.log("Seeding database with mock data...")
  console.log("(Set DAX_SEED_DATA=false; legacy COGNITO_SEED_DATA=false)")

  initDb()
  const db = getDb()

  await db
    .insert(schema.workNotes)
    .values(MOCK_WORK_NOTES)
    .onConflictDoNothing();
  await db
    .insert(schema.decisions)
    .values(MOCK_DECISIONS)
    .onConflictDoNothing();
  await db
    .insert(schema.experiments)
    .values(MOCK_EXPERIMENTS)
    .onConflictDoNothing();

  const contractsToInsert = Object.entries(MOCK_CONTRACTS).map(
    ([id, value]) => ({
      id,
      rules: value.rules,
      enforced: value.enforced,
    }),
  );
  await db
    .insert(schema.contracts)
    .values(contractsToInsert)
    .onConflictDoNothing();

  console.log("✅ Database seeded successfully");
}

main().catch((e) => {
  console.error("❌ Seeding failed", e);
  process.exit(1);
});
