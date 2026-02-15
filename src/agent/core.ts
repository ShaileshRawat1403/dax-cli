import { randomUUID } from "crypto"
import type { LLMProvider, Message, Tool, ToolCall, LLMConfig } from "../llm/types.js"
import type { ToolRegistry, ToolContext, ToolResult } from "../tools/types.js"
import { createSystemPrompt } from "../llm/types.js"
import { createWorkNote, createDecision, type NewWorkNote } from "../data.js"
import { initializeValidation, initializeScopeTracking, initializeExperimentRunner } from "../tools/validation.js"
import { createWorkNotesPrompt, formatWorkNotesSummary } from "./prompts.js"
import { applyPMCommands } from "../pm/commands.js"
import { buildContextPack } from "../pm/contextPack.js"
import { getOrCreateProject, getPMEvent, listPMEvents, loadPM, savePM, undoLastPMEvent } from "../pm/store.js"
import { MAX_RAO_HISTORY, defaultPMState, type PMState, type RaoSnapshot } from "../pm/types.js"
import { diffKeys } from "../pm/format.js"
import { evaluateGates, type GateWarning } from "../orchestration/gates.js"

export interface AgentConfig {
  name: string
  mode: "build" | "plan"
  provider: LLMProvider
  tools: ToolRegistry
  workDir: string
  scope?: {
    files: string[]
    maxFiles: number
    maxLoc: number
  }
  contract?: string
  llmConfig?: LLMConfig
  requireApproval?: boolean
}

export interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool"
  content: string
  timestamp: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
}

export interface WorkNotes {
  intent: { what: string; why: string }
  hypothesis: { expected: string; metrics: string[] }
  plan: { steps: string[]; alternatives: string[]; rationale: string }
  scope: { files: string[]; max_files: number; max_loc: number }
  assumptions: string[]
  risks: { technical: string[]; behavioral: string[] }
  status: string
}

export interface PendingGate {
  blocked: boolean
  warnings: GateWarning[]
  toolCalls: ToolCall[]
}

export class Agent {
  private config: AgentConfig
  private messages: Message[] = []
  private conversation: AgentMessage[] = []
  private workNotes?: WorkNotes
  private id: string
  private projectId?: string
  private pmState: PMState
  private userId: string
  private pendingGate?: PendingGate
  private approveOnce = false
  private lastRun?: { tool: string; targets: string[]; result: "ok" | "failed"; ts: string }
  private lastAudit: { gate: "clean" | "warn" | "blocked"; warnings: GateWarning[]; ts: string } = {
    gate: "clean",
    warnings: [],
    ts: new Date().toISOString(),
  }
  private lastOverride?: { id: string; changed_keys: string[] }

  constructor(config: AgentConfig) {
    this.config = config
    this.id = `agent-${randomUUID()}`
    this.userId = process.env.DAX_USER_ID || process.env.COGNITO_USER_ID || "local-user"
    this.pmState = defaultPMState("pending")

    // Initialize validation and tracking systems
    initializeValidation(config.workDir)
    initializeScopeTracking(config.workDir, { scope: config.scope } as ToolContext)
    initializeExperimentRunner(config.workDir)

    // Initialize with system prompt
    const systemPrompt = createSystemPrompt({
      agentName: config.name,
      agentMode: config.mode,
      scope: config.scope,
      contract: config.contract,
    })

    this.messages.push({
      role: "system",
      content: systemPrompt,
    })
  }

  private async ensureProject() {
    if (this.projectId) return
    const project = await getOrCreateProject(this.userId, this.config.workDir)
    this.projectId = project.id
    this.pmState = await loadPM(project.id)
  }

  private async contextMessages(extra?: Message[]) {
    await this.ensureProject()
    const base = this.messages.filter((m) => m.role !== "system")
    const ctx = buildContextPack({
      pm: this.pmState,
      mode: this.config.mode,
      notes: this.workNotes,
    })
    const system = this.messages.find((m) => m.role === "system")
    const withContext: Message[] = [
      ...(system ? [system] : []),
      { role: "system", content: ctx },
      ...base,
    ]
    return extra ? [...withContext, ...extra] : withContext
  }

  private toolTargets(toolCall: ToolCall) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(toolCall.function.arguments || "{}")
    } catch {
      args = {}
    }
    const keys = ["path", "file", "target", "baseline_file", "proposed_file", "files"]
    return keys
      .map((key) => args[key])
      .flatMap((value) => {
        if (!value) return []
        if (typeof value === "string") return [value]
        if (Array.isArray(value)) return value.filter((row): row is string => typeof row === "string")
        return []
      })
  }

  private setLastRun(toolCall: ToolCall, result: ToolResult) {
    this.lastRun = {
      tool: toolCall.function.name,
      targets: this.toolTargets(toolCall),
      result: result.success ? "ok" : "failed",
      ts: new Date().toISOString(),
    }
  }

  private setLastAudit(gate: "clean" | "warn" | "blocked", warnings: GateWarning[]) {
    this.lastAudit = {
      gate,
      warnings: warnings.slice(0, 4),
      ts: new Date().toISOString(),
    }
  }

  private setLastOverride(before: Record<string, unknown>, after: Record<string, unknown>, id: string) {
    this.lastOverride = {
      id,
      changed_keys: diffKeys(before, after),
    }
  }

  private canonicalAudit(audit: RaoSnapshot["audit"]) {
    if (!audit) return null
    const warnings = (audit.warnings || [])
      .map((warning) => ({
        code: String(warning.code || ""),
        subject: String(warning.subject || ""),
        message: String(warning.message || ""),
      }))
      .sort((a, b) =>
        (a.code + "\n" + a.subject + "\n" + a.message).localeCompare(
          b.code + "\n" + b.subject + "\n" + b.message,
        ),
      )
    return {
      blocked: Boolean(audit.blocked),
      warnings,
    }
  }

  private sameAudit(a: RaoSnapshot | undefined, b: RaoSnapshot) {
    if (!a || a.kind !== "audit" || b.kind !== "audit") return false
    const left = this.canonicalAudit(a.audit)
    const right = this.canonicalAudit(b.audit)
    if (!left || !right) return false
    return JSON.stringify(left) === JSON.stringify(right)
  }

  private async appendRao(snapshot: Omit<RaoSnapshot, "id" | "ts">) {
    if (!this.projectId) return
    const row = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      ...snapshot,
    } as RaoSnapshot
    const history = this.pmState.rao?.history || []
    const last = history[history.length - 1]
    if (this.sameAudit(last, row)) return
    const next = [...history, row].slice(-MAX_RAO_HISTORY)
    this.pmState = await savePM(this.projectId, {
      rao: { history: next },
    })
  }

  private async refreshLastOverride(persist = false) {
    if (!this.projectId) return
    const row = (await listPMEvents(this.projectId, 1))[0]
    if (!row) return
    const before = row.before_json as unknown as Record<string, unknown>
    const after = row.after_json as unknown as Record<string, unknown>
    this.setLastOverride(before, after, row.id)
    if (!persist) return
    await this.appendRao({
      kind: "override",
      override: {
        event_id: row.id,
        changed_keys: diffKeys(before, after),
        command: row.command,
      },
    })
  }

  private async applyPmCommands(message: string) {
    await this.ensureProject()
    const result = applyPMCommands(message, this.pmState)
    if (!result.applied || !this.projectId) return null
    this.pmState = await savePM(this.projectId, result.updates, {
      command: message,
      actor: "user",
    })
    await this.refreshLastOverride(true)
    const confirmation = result.confirmation || "Updated project PM settings."
    this.conversation.push({
      role: "assistant",
      content: confirmation,
      timestamp: new Date().toISOString(),
    })
    return confirmation
  }

  private async writeBack(result: ToolResult, toolCall: ToolCall) {
    if (!this.projectId) return
    const summary = result.success ? result.output.slice(0, 180) : (result.error || "failed")
    const outcomes = [...this.pmState.recent_outcomes, {
      ts: new Date().toISOString(),
      tool: toolCall.function.name,
      success: result.success,
      summary,
    }].slice(-12)
    this.pmState = await savePM(this.projectId, {
      recent_outcomes: outcomes,
    })
    if (!result.success) return
    await createDecision({
      project_id: this.projectId,
      context: `Tool execution: ${toolCall.function.name}`,
      decision: "Tool call executed",
      rationale: summary,
      alternatives: [],
      confidence: "medium",
      reversible: true,
    })
  }

  private async executeToolCalls(toolCalls: ToolCall[]) {
    const toolResults: ToolResult[] = []
    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall)
      this.setLastRun(toolCall, result)
      await this.appendRao({
        kind: "run",
        run: {
          tool: toolCall.function.name,
          targets: this.toolTargets(toolCall),
          ok: result.success,
        },
      })
      toolResults.push(result)
      await this.writeBack(result, toolCall)
      this.messages.push({
        role: "tool",
        content: result.success ? result.output : result.error || "Error",
        tool_call_id: toolCall.id,
      })
    }
    return toolResults
  }

  getMode(): "build" | "plan" {
    return this.config.mode
  }

  getConversation(): AgentMessage[] {
    return this.conversation
  }

  getWorkNotes(): WorkNotes | undefined {
    return this.workNotes
  }

  getPendingGate() {
    return this.pendingGate
  }

  getRaoStatus() {
    return {
      run: this.lastRun || null,
      audit: this.lastAudit,
      override: this.lastOverride || null,
    }
  }

  async getRaoHistory(limit = 10) {
    await this.ensureProject()
    const history = this.pmState.rao?.history || []
    return [...history].slice(-Math.max(1, limit)).reverse()
  }

  async getRaoHistoryEvent(id: string) {
    await this.ensureProject()
    const history = this.pmState.rao?.history || []
    return history.find((row) => row.id === id) || null
  }

  async simulateRaoReplay(limit = 10) {
    await this.ensureProject()
    const history = [...(this.pmState.rao?.history || [])].slice(-Math.max(1, limit)).reverse()
    return history.map((row) => {
      if (row.kind !== "run" || !row.run) {
        return {
          id: row.id,
          ts: row.ts,
          kind: row.kind,
          recorded: row.kind === "audit" ? row.audit || null : row.run || row.override || null,
          simulate: { available: false, reason: "simulation requires run event tool metadata" },
        }
      }
      const call: ToolCall = {
        id: "sim-" + row.id,
        type: "function",
        function: {
          name: row.run.tool,
          arguments: JSON.stringify({ files: row.run.targets }),
        },
      }
      const gate = evaluateGates([call], this.pmState)
      return {
        id: row.id,
        ts: row.ts,
        kind: row.kind,
        recorded: row.run,
        simulate: {
          available: true,
          blocked: gate.blocked,
          warnings: gate.warnings,
          needs_approval: gate.needs_approval,
        },
      }
    })
  }

  async getRaoHistorySize() {
    await this.ensureProject()
    return this.pmState.rao?.history.length || 0
  }

  async purgeRaoHistory() {
    await this.ensureProject()
    if (!this.projectId) return false
    this.pmState = await savePM(this.projectId, {
      rao: { history: [] },
    }, {
      command: "/rao purge",
      actor: "user",
      event_type: "rao_purge",
    })
    this.clearRaoStatus()
    return true
  }

  clearRaoStatus() {
    this.lastRun = undefined
    this.lastAudit = {
      gate: "clean",
      warnings: [],
      ts: new Date().toISOString(),
    }
    this.lastOverride = undefined
  }

  async listPMHistory(limit = 20) {
    await this.ensureProject()
    if (!this.projectId) return []
    const rows = await listPMEvents(this.projectId, limit)
    return rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      command: row.command,
      event_type: row.event_type,
      changed_keys: diffKeys(
        row.before_json as unknown as Record<string, unknown>,
        row.after_json as unknown as Record<string, unknown>,
      ),
    }))
  }

  async getPMHistoryEvent(eventId: string) {
    await this.ensureProject()
    if (!this.projectId) return null
    return await getPMEvent(this.projectId, eventId)
  }

  getPMStateSummary() {
    return {
      risk: this.pmState.preferences.risk || "balanced",
      verbosity: this.pmState.preferences.verbosity || "medium",
      never_touch: this.pmState.constraints.never_touch || [],
      always_allow: this.pmState.constraints.always_allow || [],
      recent_outcomes: this.pmState.recent_outcomes.slice(-3),
    }
  }

  async approvePendingOnce() {
    if (!this.pendingGate) return false
    const gate = this.pendingGate
    this.pendingGate = undefined
    this.approveOnce = true
    const toolResults = await this.executeToolCalls(gate.toolCalls)
    this.setLastAudit(gate.warnings.length > 0 ? "warn" : "clean", gate.warnings)
    this.conversation.push({
      role: "assistant",
      content: `Approved once. Executed ${gate.toolCalls.length} tool call(s).`,
      timestamp: new Date().toISOString(),
      toolCalls: gate.toolCalls,
      toolResults,
    })
    this.approveOnce = false
    return true
  }

  async alwaysAllowFromPending(kind: "tool" | "path", pattern?: string) {
    if (!this.projectId || !this.pendingGate || this.pendingGate.blocked) return false
    const extra = kind === "path"
      ? [{ kind: "path" as const, pattern: pattern || "" }].filter((rule) => rule.pattern)
      : this.pendingGate.toolCalls
          .map((call) => ({ kind: "tool" as const, pattern: call.function.name }))
          .filter((rule) => rule.pattern)
    if (extra.length === 0) return false
    const next = [...(this.pmState.constraints.always_allow || []), ...extra].filter((row, index, arr) =>
      arr.findIndex((item) => item.kind === row.kind && item.pattern === row.pattern) === index,
    )
    this.pmState = await savePM(this.projectId, {
      constraints: {
        ...this.pmState.constraints,
        always_allow: next,
      },
    }, {
      command: `/pm allow ${kind} ${kind === "path" ? pattern : "tool-call"}`,
      actor: "user",
    })
    await this.refreshLastOverride(true)
    return await this.approvePendingOnce()
  }

  async undoPM() {
    await this.ensureProject()
    if (!this.projectId) return false
    const next = await undoLastPMEvent(this.projectId)
    if (!next) return false
    this.pmState = next
    await this.refreshLastOverride(true)
    return true
  }

  rejectPendingGate() {
    this.pendingGate = undefined
  }

  canStream(): boolean {
    return typeof this.config.provider.stream === "function"
  }

  async startTask(taskDescription: string): Promise<void> {
    await this.ensureProject()
    // Add user message
    this.messages.push({
      role: "user",
      content: taskDescription,
    })

    this.conversation.push({
      role: "user",
      content: taskDescription,
      timestamp: new Date().toISOString(),
    })

    // Generate initial work notes
    await this.generateWorkNotes(taskDescription)
  }

  private async generateWorkNotes(taskDescription: string): Promise<void> {
    const workNotePrompt = createWorkNotesPrompt(taskDescription)
    const msgs = await this.contextMessages([{ role: "user", content: workNotePrompt }])

    const response = await this.config.provider.complete(
      msgs,
      undefined,
      { ...this.config.llmConfig, temperature: 0.3 },
    )

    try {
      const content = response.content.replace(/```json\n?|\n?```/g, "").trim()
      const notes = JSON.parse(content) as WorkNotes
      this.workNotes = notes

      // Store work notes in database
      const noteData: NewWorkNote = {
        intent: notes.intent,
        hypothesis: notes.hypothesis,
        plan: notes.plan,
        scope: notes.scope,
        assumptions: notes.assumptions,
        risks: notes.risks,
        status: notes.status,
      }

      await createWorkNote(noteData)

      this.conversation.push({
        role: "assistant",
        content: formatWorkNotesSummary(notes),
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      this.conversation.push({
        role: "assistant",
        content: `Error generating work notes: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      })
    }
  }

  async continue(): Promise<boolean> {
    if (!this.workNotes) {
      throw new Error("No active task. Call startTask() first.")
    }

    if (this.config.mode === "plan") {
      // In plan mode, just provide analysis
      return await this.runAnalysis()
    }

    // In build mode, execute tools
    return await this.runBuild()
  }

  private async runAnalysis(): Promise<boolean> {
    const tools = this.config.tools.toLLMTools()
    const msgs = await this.contextMessages()

    const response = await this.config.provider.complete(
      msgs,
      tools,
      this.config.llmConfig,
    )

    this.messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.tool_calls,
    })

    this.conversation.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
      toolCalls: response.tool_calls,
    })

    // In plan mode, we don't execute tools automatically
    return false
  }

  private async runBuild(): Promise<boolean> {
    const tools = this.config.tools.toLLMTools()
    const msgs = await this.contextMessages()

    const response = await this.config.provider.complete(
      msgs,
      tools,
      this.config.llmConfig,
    )

    this.messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.tool_calls,
    })

    let toolResults: ToolResult[] = []
    if (response.tool_calls && response.tool_calls.length > 0) {
      const gate = evaluateGates(response.tool_calls, this.pmState)
      this.setLastAudit(gate.blocked ? "blocked" : (gate.needs_approval ? "warn" : "clean"), gate.warnings)
      if (gate.warnings.length > 0) {
        await this.appendRao({
          kind: "audit",
          audit: {
            blocked: gate.blocked,
            warnings: gate.warnings.map((row) => ({
              code: row.code,
              subject: row.subject,
              message: row.message,
            })),
          },
        })
      }
      if (gate.needs_approval && this.config.requireApproval && !this.approveOnce) {
        this.pendingGate = {
          blocked: gate.blocked,
          warnings: gate.warnings,
          toolCalls: response.tool_calls,
        }
        this.conversation.push({
          role: "assistant",
          content: `Approval required before execution:\n- ${gate.warnings.map((row) => row.message).join("\n- ")}`,
          timestamp: new Date().toISOString(),
        })
        return false
      }
      this.pendingGate = undefined
      toolResults = await this.executeToolCalls(response.tool_calls)
      this.approveOnce = false
    }

    if (!response.tool_calls || response.tool_calls.length === 0) {
      this.setLastAudit("clean", [])
    }

    this.conversation.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
      toolCalls: response.tool_calls,
      toolResults,
    })

    // Check if we're done (no tool calls or explicit completion)
    const isComplete =
      !response.tool_calls ||
      response.tool_calls.length === 0 ||
      response.content.toLowerCase().includes("task complete")

    return !isComplete
  }

  private async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.config.tools.get(toolCall.function.name)

    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Tool not found: ${toolCall.function.name}`,
      }
    }

    try {
      const args = JSON.parse(toolCall.function.arguments)
      const context: ToolContext = {
        workDir: this.config.workDir,
        scope: this.config.scope,
      }

      return await tool.execute(args, context)
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async sendMessage(message: string): Promise<void> {
    const applied = await this.applyPmCommands(message)
    if (applied) return
    this.messages.push({
      role: "user",
      content: message,
    })

    this.conversation.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    })

    await this.continue()
  }

  async chat(message: string): Promise<void> {
    const applied = await this.applyPmCommands(message)
    if (applied) return
    this.messages.push({
      role: "user",
      content: message,
    })

    this.conversation.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    })

    const msgs = await this.contextMessages()
    const response = await this.config.provider.complete(
      msgs,
      undefined,
      this.config.llmConfig,
    )

    this.messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.tool_calls,
    })

    this.conversation.push({
      role: "assistant",
      content: response.content,
      timestamp: new Date().toISOString(),
      toolCalls: response.tool_calls,
    })
  }

  async chatStream(
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const applied = await this.applyPmCommands(message)
    if (applied) {
      onChunk(applied)
      return
    }
    this.messages.push({
      role: "user",
      content: message,
    })

    this.conversation.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    })

    const msgs = await this.contextMessages()
    if (typeof this.config.provider.stream !== "function") {
      const response = await this.config.provider.complete(
        msgs,
        undefined,
        this.config.llmConfig,
      )

      this.messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      })

      this.conversation.push({
        role: "assistant",
        content: response.content,
        timestamp: new Date().toISOString(),
        toolCalls: response.tool_calls,
      })
      return
    }

    let content = ""
    let calls: ToolCall[] | undefined
    try {
      for await (const chunk of this.config.provider.stream(
        msgs,
        undefined,
        this.config.llmConfig,
      )) {
        if (chunk.content) {
          content += chunk.content
          onChunk(chunk.content)
        }
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          calls = [...(calls || []), ...chunk.tool_calls]
        }
      }
    } catch {
      const response = await this.config.provider.complete(
        msgs,
        undefined,
        this.config.llmConfig,
      )
      content = response.content
      calls = response.tool_calls
      if (response.content) {
        onChunk(response.content)
      }
    }

    this.messages.push({
      role: "assistant",
      content,
      tool_calls: calls,
    })

    this.conversation.push({
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      toolCalls: calls,
    })
  }

  updateScope(scope: { files: string[]; maxFiles: number; maxLoc: number }) {
    this.config.scope = scope
    if (this.workNotes) {
      this.workNotes.scope = {
        files: scope.files,
        max_files: scope.maxFiles,
        max_loc: scope.maxLoc,
      }
    }
  }

  loadHistory(history: AgentMessage[]) {
    this.conversation = history
  }

  setWorkNotes(notes: WorkNotes) {
    this.workNotes = notes
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config)
}
