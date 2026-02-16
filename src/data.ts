import { db } from "./db/index";
import * as schema from "./db/schema";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const createWorkNoteSchema = z.object({
  intent: z.object({
    what: z.string().min(1),
    why: z.string().min(1),
  }),
  hypothesis: z.object({
    expected: z.string().min(1),
    metrics: z.array(z.string()),
  }),
  plan: z.object({
    steps: z.array(z.string()),
    alternatives: z.array(z.string()),
    rationale: z.string(),
  }),
  scope: z.object({
    files: z.array(z.string()),
    max_files: z.number().int(),
    max_loc: z.number().int(),
  }),
  assumptions: z.array(z.string()),
  risks: z.object({
    technical: z.array(z.string()),
    behavioral: z.array(z.string()),
  }),
  status: z.string(),
});

export type NewWorkNote = z.infer<typeof createWorkNoteSchema>;

export const updateWorkNoteSchema = createWorkNoteSchema.partial();
export type UpdateWorkNote = z.infer<typeof updateWorkNoteSchema>;

export async function getWorkNotes() {
  const notes = await db.query.workNotes.findMany();
  return { notes };
}

export async function getWorkNoteById(id: string) {
  const [note] = await db
    .select()
    .from(schema.workNotes)
    .where(eq(schema.workNotes.id, id));
  // Drizzle returns an array, so we take the first element or null.
  return note ?? null;
}

// --- Decisions ---

export const createDecisionSchema = z.object({
  project_id: z.string().optional(),
  context: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  alternatives: z.array(
    z.object({
      name: z.string().min(1),
      reason_rejected: z.string().min(1),
    }),
  ),
  confidence: z.string().min(1),
  reversible: z.boolean(),
});

export type NewDecision = z.infer<typeof createDecisionSchema>;
export const updateDecisionSchema = createDecisionSchema.partial();
export type UpdateDecision = z.infer<typeof updateDecisionSchema>;

export async function getDecisions() {
  const decisions = await db.query.decisions.findMany();
  return { decisions };
}

export async function getDecisionById(id: string) {
  const [decision] = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.id, id));
  return decision ?? null;
}

export async function createDecision(decisionData: NewDecision) {
  const newDecision = {
    ...decisionData,
    id: `dec-${randomUUID()}`,
    timestamp: new Date().toISOString(),
  };
  const [inserted] = await db
    .insert(schema.decisions)
    .values(newDecision)
    .returning();
  return inserted;
}

export async function updateDecision(id: string, decisionData: UpdateDecision) {
  if (Object.keys(decisionData).length === 0) {
    return getDecisionById(id);
  }
  const [updated] = await db
    .update(schema.decisions)
    .set(decisionData)
    .where(eq(schema.decisions.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteDecision(id: string) {
  const [deleted] = await db
    .delete(schema.decisions)
    .where(eq(schema.decisions.id, id))
    .returning();
  return deleted ?? null;
}

// --- Experiments ---

const metricsSchema = z.object({
  avg_latency: z.string(),
  p99_latency: z.string(),
  memory: z.string(),
  tests_passed: z.string(),
});

const variantSchema = z.object({
  label: z.string(),
  description: z.string(),
  metrics: metricsSchema,
});

export const createExperimentSchema = z.object({
  name: z.string().min(1),
  status: z.string().min(1),
  variant_a: variantSchema,
  variant_b: variantSchema,
  deltas: metricsSchema,
  verdict: z.string().min(1),
});

export type NewExperiment = z.infer<typeof createExperimentSchema>;
export const updateExperimentSchema = createExperimentSchema.partial();
export type UpdateExperiment = z.infer<typeof updateExperimentSchema>;

export async function getExperiments() {
  const experiments = await db.query.experiments.findMany();
  return { experiments };
}

export async function getExperimentById(id: string) {
  const [experiment] = await db
    .select()
    .from(schema.experiments)
    .where(eq(schema.experiments.id, id));
  return experiment ?? null;
}

export async function getContracts() {
  const contractList = await db.query.contracts.findMany();
  // The API expects a nested object, so we transform the flat array from the DB.
  const contractsObject = contractList.reduce(
    (acc, contract) => {
      acc[contract.id] = {
        rules: contract.rules,
        enforced: contract.enforced,
      };
      return acc;
    },
    {} as Record<string, { rules: string[]; enforced: boolean }>,
  );
  return { contracts: contractsObject };
}

export async function createExperiment(experimentData: NewExperiment) {
  const newExperiment = {
    ...experimentData,
    id: `exp-${randomUUID()}`,
  };
  const [inserted] = await db
    .insert(schema.experiments)
    .values(newExperiment)
    .returning();
  return inserted;
}

export async function updateExperiment(
  id: string,
  experimentData: UpdateExperiment,
) {
  if (Object.keys(experimentData).length === 0) {
    return getExperimentById(id);
  }
  const [updated] = await db
    .update(schema.experiments)
    .set(experimentData)
    .where(eq(schema.experiments.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteExperiment(id: string) {
  const [deleted] = await db
    .delete(schema.experiments)
    .where(eq(schema.experiments.id, id))
    .returning();
  return deleted ?? null;
}

export async function createWorkNote(noteData: NewWorkNote) {
  const newNote = {
    ...noteData,
    id: `wn-${randomUUID()}`,
    created: new Date().toISOString(),
  };

  const [insertedNote] = await db
    .insert(schema.workNotes)
    .values(newNote)
    .returning();
  return insertedNote;
}

export async function updateWorkNote(id: string, noteData: UpdateWorkNote) {
  if (Object.keys(noteData).length === 0) {
    // If the body is empty, just return the existing note without an update.
    return getWorkNoteById(id);
  }
  const [updatedNote] = await db
    .update(schema.workNotes)
    .set(noteData)
    .where(eq(schema.workNotes.id, id))
    .returning();
  return updatedNote ?? null;
}

export async function deleteWorkNote(id: string) {
  const [deletedNote] = await db
    .delete(schema.workNotes)
    .where(eq(schema.workNotes.id, id))
    .returning();
  return deletedNote ?? null;
}
