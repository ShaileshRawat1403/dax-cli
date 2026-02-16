import { randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { experiments } from "../db/schema.js"

export interface ExperimentVariant {
  label: string
  description: string
  code: string
  filePath: string
}

export interface ExperimentMetrics {
  avg_latency?: string
  p99_latency?: string
  memory?: string
  tests_passed?: string
  bundle_size?: string
  [key: string]: string | undefined
}

function strictMetrics(metrics: ExperimentMetrics) {
  return {
    avg_latency: metrics.avg_latency || "N/A",
    p99_latency: metrics.p99_latency || "N/A",
    memory: metrics.memory || "N/A",
    tests_passed: metrics.tests_passed || "N/A",
  }
}

function strictDeltas(deltas: Record<string, string>) {
  return {
    avg_latency: deltas.avg_latency || "N/A",
    p99_latency: deltas.p99_latency || "N/A",
    memory: deltas.memory || "N/A",
    tests_passed: deltas.tests_passed || "N/A",
  }
}

export interface ExperimentResult {
  id: string
  name: string
  status: "running" | "completed" | "failed"
  variant_a: {
    label: string
    description: string
    metrics: ExperimentMetrics
  }
  variant_b: {
    label: string
    description: string
    metrics: ExperimentMetrics
  }
  deltas: Record<string, string>
  verdict?: string
  createdAt: string
  completedAt?: string
}

export class ExperimentRunner {
  private workDir: string
  private activeExperiments: Map<string, ExperimentResult>

  constructor(workDir: string) {
    this.workDir = workDir
    this.activeExperiments = new Map()
  }

  async createExperiment(
    name: string,
    description: string,
    baseline: ExperimentVariant,
    proposed: ExperimentVariant
  ): Promise<ExperimentResult> {
    const experiment: ExperimentResult = {
      id: `exp-${randomUUID()}`,
      name,
      status: "running",
      variant_a: {
        label: baseline.label,
        description: baseline.description,
        metrics: {},
      },
      variant_b: {
        label: proposed.label,
        description: proposed.description,
        metrics: {},
      },
      deltas: {},
      createdAt: new Date().toISOString(),
    }

    this.activeExperiments.set(experiment.id, experiment)

    // Store in database
    await db.insert(experiments).values({
      id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      variant_a: {
        label: experiment.variant_a.label,
        description: experiment.variant_a.description,
        metrics: strictMetrics(experiment.variant_a.metrics),
      },
      variant_b: {
        label: experiment.variant_b.label,
        description: experiment.variant_b.description,
        metrics: strictMetrics(experiment.variant_b.metrics),
      },
      deltas: strictDeltas(experiment.deltas),
      verdict: "",
    })

    return experiment
  }

  async runBenchmark(experimentId: string): Promise<void> {
    const experiment = this.activeExperiments.get(experimentId)
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`)
    }

    // Run tests and collect metrics for variant A (baseline)
    const variantAMetrics = await this.collectMetrics("baseline")
    experiment.variant_a.metrics = variantAMetrics

    // Apply variant B code
    await this.applyVariant(experimentId, "b")

    // Run tests and collect metrics for variant B (proposed)
    const variantBMetrics = await this.collectMetrics("proposed")
    experiment.variant_b.metrics = variantBMetrics

    // Calculate deltas
    experiment.deltas = this.calculateDeltas(variantAMetrics, variantBMetrics)

    // Restore baseline
    await this.applyVariant(experimentId, "a")

    // Generate verdict
    experiment.verdict = this.generateVerdict(experiment)
    experiment.status = "completed"
    experiment.completedAt = new Date().toISOString()

    // Update database
    await db
      .update(experiments)
      .set({
        status: experiment.status,
        variant_a: {
          label: experiment.variant_a.label,
          description: experiment.variant_a.description,
          metrics: strictMetrics(experiment.variant_a.metrics),
        },
        variant_b: {
          label: experiment.variant_b.label,
          description: experiment.variant_b.description,
          metrics: strictMetrics(experiment.variant_b.metrics),
        },
        deltas: strictDeltas(experiment.deltas),
        verdict: experiment.verdict,
      })
      .where(eq(experiments.id, experimentId))
  }

  private async collectMetrics(label: string): Promise<ExperimentMetrics> {
    const metrics: ExperimentMetrics = {}

    try {
      // Run tests and capture results
      const testProc = Bun.spawn(["bun", "test"], {
        cwd: this.workDir,
        stdout: "pipe",
        stderr: "pipe",
      })

      const testOutput = await new Response(testProc.stdout).text()
      const testExitCode = await testProc.exited

      // Parse test results (simple parsing)
      const passMatch = testOutput.match(/(\d+) passed/)
      const failMatch = testOutput.match(/(\d+) failed/)
      const totalMatch = testOutput.match(/(\d+) total/)

      if (passMatch && totalMatch) {
        metrics.tests_passed = `${passMatch[1]}/${totalMatch[1]}`
      } else {
        metrics.tests_passed = testExitCode === 0 ? "passed" : "failed"
      }

      // Measure bundle size if applicable
      try {
        const buildProc = Bun.spawn(["bun", "build", "./src/index.ts", "--outdir", "/tmp/benchmark"], {
          cwd: this.workDir,
          stdout: "pipe",
          stderr: "pipe",
        })
        await buildProc.exited

        const stats = await Bun.file("/tmp/benchmark/index.js").stat()
        metrics.bundle_size = `${(stats.size / 1024).toFixed(2)}KB`
      } catch {
        metrics.bundle_size = "N/A"
      }

      // Simple performance benchmark
      const start = performance.now()
      // Run a quick lint check as proxy for complexity
      const lintProc = Bun.spawn(["bun", "run", "lint"], {
        cwd: this.workDir,
        stdout: "pipe",
        stderr: "pipe",
      })
      await lintProc.exited
      const end = performance.now()

      metrics.avg_latency = `${(end - start).toFixed(2)}ms`
      metrics.memory = `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB`
    } catch (error) {
      metrics.tests_passed = "error"
      metrics.avg_latency = "N/A"
    }

    return metrics
  }

  private calculateDeltas(
    baseline: ExperimentMetrics,
    proposed: ExperimentMetrics
  ): Record<string, string> {
    const deltas: Record<string, string> = {}

    for (const key of Object.keys(proposed)) {
      const baselineVal = baseline[key]
      const proposedVal = proposed[key]

      if (baselineVal && proposedVal) {
        // Try to parse as numbers
        const baselineNum = parseFloat(baselineVal.replace(/[^\d.]/g, ""))
        const proposedNum = parseFloat(proposedVal.replace(/[^\d.]/g, ""))

        if (!isNaN(baselineNum) && !isNaN(proposedNum)) {
          const diff = proposedNum - baselineNum
          const percent = ((diff / baselineNum) * 100).toFixed(1)
          const sign = diff >= 0 ? "+" : ""
          deltas[key] = `${sign}${diff.toFixed(2)} (${sign}${percent}%)`
        } else {
          deltas[key] = `${baselineVal} → ${proposedVal}`
        }
      }
    }

    return deltas
  }

  private generateVerdict(experiment: ExperimentResult): string {
    const lines: string[] = []

    // Check test results
    const baselineTests = experiment.variant_a.metrics.tests_passed
    const proposedTests = experiment.variant_b.metrics.tests_passed

    if (proposedTests?.includes("failed") || proposedTests === "error") {
      lines.push("❌ Tests failing in proposed variant")
      return lines.join("\n")
    }

    // Check performance regressions
    const latencyDelta = experiment.deltas.avg_latency
    if (latencyDelta && latencyDelta.startsWith("+")) {
      const percentMatch = latencyDelta.match(/\(([+-]?\d+\.?\d*)%\)/)
      if (percentMatch) {
        const percent = parseFloat(percentMatch[1])
        if (percent > 10) {
          lines.push(`⚠️ Significant latency regression: ${latencyDelta}`)
        } else {
          lines.push(`✅ Acceptable latency change: ${latencyDelta}`)
        }
      }
    }

    // Check bundle size
    const bundleDelta = experiment.deltas.bundle_size
    if (bundleDelta && bundleDelta.startsWith("+")) {
      lines.push(`⚠️ Bundle size increased: ${bundleDelta}`)
    }

    if (lines.length === 0) {
      lines.push("✅ All metrics within acceptable ranges")
    }

    return lines.join("\n")
  }

  private async applyVariant(experimentId: string, variant: "a" | "b"): Promise<void> {
    // In a real implementation, this would checkout or apply the variant code
    // For now, this is a placeholder for the actual implementation
    console.log(`Applying variant ${variant} for experiment ${experimentId}`)
  }

  getExperiment(id: string): ExperimentResult | undefined {
    return this.activeExperiments.get(id)
  }

  getAllExperiments(): ExperimentResult[] {
    return Array.from(this.activeExperiments.values())
  }

  async deleteExperiment(id: string): Promise<void> {
    this.activeExperiments.delete(id)
    await db.delete(experiments).where(eq(experiments.id, id))
  }

  formatReport(experimentId: string): string {
    const exp = this.activeExperiments.get(experimentId)
    if (!exp) {
      return "Experiment not found"
    }

    const lines = [
      `🧪 Experiment: ${exp.name}`,
      `ID: ${exp.id}`,
      `Status: ${exp.status}`,
      "",
      "📊 Variant A (Baseline):",
      `  Label: ${exp.variant_a.label}`,
      `  Description: ${exp.variant_a.description}`,
      ...Object.entries(exp.variant_a.metrics).map(([k, v]) => `  ${k}: ${v}`),
      "",
      "📊 Variant B (Proposed):",
      `  Label: ${exp.variant_b.label}`,
      `  Description: ${exp.variant_b.description}`,
      ...Object.entries(exp.variant_b.metrics).map(([k, v]) => `  ${k}: ${v}`),
      "",
      "📈 Deltas:",
      ...Object.entries(exp.deltas).map(([k, v]) => `  ${k}: ${v}`),
    ]

    if (exp.verdict) {
      lines.push("", "📝 Verdict:", exp.verdict)
    }

    return lines.join("\n")
  }
}

// Helper function to parse test output
function parseTestResults(output: string): { passed: number; failed: number; total: number } {
  const passMatch = output.match(/(\d+) passed/)
  const failMatch = output.match(/(\d+) failed/)
  const totalMatch = output.match(/(\d+) total/)

  return {
    passed: parseInt(passMatch?.[1] || "0"),
    failed: parseInt(failMatch?.[1] || "0"),
    total: parseInt(totalMatch?.[1] || "0"),
  }
}
