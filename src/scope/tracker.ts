import { $ } from "bun"

export interface ScopeMetrics {
  filesModified: string[]
  totalFiles: number
  totalLoc: number
  filesAdded: number
  filesRemoved: number
  locAdded: number
  locRemoved: number
}

export interface ScopeLimits {
  maxFiles: number
  maxLoc: number
  allowedPatterns: string[]
}

export interface ScopeStatus {
  withinLimits: boolean
  metrics: ScopeMetrics
  limits: ScopeLimits
  touchedFilesCount: number
  changedLoc: number
  warnings: string[]
}

export class ScopeTracker {
  private metrics: ScopeMetrics
  private limits: ScopeLimits
  private workDir: string
  private baselineFiles: Map<string, number> // file -> loc

  constructor(workDir: string, limits: ScopeLimits) {
    this.workDir = workDir
    this.limits = limits
    this.metrics = {
      filesModified: [],
      totalFiles: 0,
      totalLoc: 0,
      filesAdded: 0,
      filesRemoved: 0,
      locAdded: 0,
      locRemoved: 0,
    }
    this.baselineFiles = new Map()
  }

  async initialize(): Promise<void> {
    // Capture baseline state
    await this.captureBaseline()
  }

  private async captureBaseline(): Promise<void> {
    const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}")
    
    for await (const filePath of glob.scan(this.workDir)) {
      const fullPath = `${this.workDir}/${filePath}`
      const content = await Bun.file(fullPath).text()
      const loc = content.split("\n").length
      this.baselineFiles.set(filePath, loc)
    }
    
    this.metrics.totalFiles = this.baselineFiles.size
    this.metrics.totalLoc = Array.from(this.baselineFiles.values()).reduce((a, b) => a + b, 0)
  }

  async trackFileChange(filePath: string, oldContent?: string, newContent?: string): Promise<void> {
    // Check if file is in scope
    if (!this.isFileInScope(filePath)) {
      return
    }

    // Track the modification
    if (!this.metrics.filesModified.includes(filePath)) {
      this.metrics.filesModified.push(filePath)
    }

    // Calculate LOC changes
    if (oldContent !== undefined && newContent !== undefined) {
      const oldLoc = oldContent.split("\n").length
      const newLoc = newContent.split("\n").length
      const diff = newLoc - oldLoc
      
      if (diff > 0) {
        this.metrics.locAdded += diff
      } else {
        this.metrics.locRemoved += Math.abs(diff)
      }
    } else if (newContent !== undefined && oldContent === undefined) {
      // New file
      this.metrics.filesAdded++
      this.metrics.locAdded += newContent.split("\n").length
    } else if (oldContent !== undefined && newContent === undefined) {
      // Deleted file
      this.metrics.filesRemoved++
      this.metrics.locRemoved += oldContent.split("\n").length
    }

    // Recalculate totals
    await this.recalculateTotals()
  }

  private async recalculateTotals(): Promise<void> {
    let totalFiles = 0
    let totalLoc = 0
    
    const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}")
    
    for await (const filePath of glob.scan(this.workDir)) {
      const fullPath = `${this.workDir}/${filePath}`
      const content = await Bun.file(fullPath).text()
      const loc = content.split("\n").length
      totalFiles++
      totalLoc += loc
    }
    
    this.metrics.totalFiles = totalFiles
    this.metrics.totalLoc = totalLoc
  }

  private isFileInScope(filePath: string): boolean {
    return this.limits.allowedPatterns.some(pattern => {
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))
        return regex.test(filePath)
      }
      return filePath.startsWith(pattern.replace(/\*$/, ""))
    })
  }

  getStatus(): ScopeStatus {
    const warnings: string[] = []
    const touchedFilesCount = this.metrics.filesModified.length
    const changedLoc = this.metrics.locAdded + this.metrics.locRemoved
    
    if (changedLoc > this.limits.maxLoc) {
      warnings.push(
        `Changed LOC (${changedLoc}) exceeds limit (${this.limits.maxLoc})`
      )
    }
    
    if (touchedFilesCount > this.limits.maxFiles) {
      warnings.push(
        `Touched files (${touchedFilesCount}) exceeds limit (${this.limits.maxFiles})`
      )
    }

    return {
      withinLimits: warnings.length === 0,
      metrics: { ...this.metrics },
      limits: { ...this.limits },
      touchedFilesCount,
      changedLoc,
      warnings,
    }
  }

  async checkScopeExpansion(): Promise<{
    needsApproval: boolean
    reason?: string
    current: { files: number; loc: number }
    requested: { files: number; loc: number }
  }> {
    const status = this.getStatus()
    
    if (status.withinLimits) {
      return {
        needsApproval: false,
        current: { files: status.touchedFilesCount, loc: status.changedLoc },
        requested: { files: status.touchedFilesCount, loc: status.changedLoc },
      }
    }
    
    return {
      needsApproval: true,
      reason: status.warnings.join("; "),
      current: { files: status.touchedFilesCount, loc: status.changedLoc },
      requested: { files: status.touchedFilesCount, loc: status.changedLoc },
    }
  }

  getMetrics(): ScopeMetrics {
    return { ...this.metrics }
  }

  reset(): void {
    this.metrics = {
      filesModified: [],
      totalFiles: 0,
      totalLoc: 0,
      filesAdded: 0,
      filesRemoved: 0,
      locAdded: 0,
      locRemoved: 0,
    }
    this.baselineFiles.clear()
  }

  formatStatus(): string {
    const status = this.getStatus()
    const lines = [
      "📊 Scope Status",
      "",
      `Files modified: ${status.metrics.filesModified.length}`,
      `Touched files: ${status.touchedFilesCount} / ${status.limits.maxFiles}`,
      `Changed LOC: ${status.changedLoc} / ${status.limits.maxLoc}`,
      `Files added: ${status.metrics.filesAdded}`,
      `Files removed: ${status.metrics.filesRemoved}`,
      `LOC added: ${status.metrics.locAdded}`,
      `LOC removed: ${status.metrics.locRemoved}`,
    ]
    
    if (status.warnings.length > 0) {
      lines.push("", "⚠️ Warnings:")
      status.warnings.forEach(w => lines.push(`  - ${w}`))
    }
    
    return lines.join("\n")
  }
}

// Factory function for creating scope tracker from agent config
export function createScopeTracker(
  workDir: string,
  scope?: { files: string[]; maxFiles: number; maxLoc: number }
): ScopeTracker | undefined {
  if (!scope) {
    return undefined
  }
  
  return new ScopeTracker(workDir, {
    maxFiles: scope.maxFiles,
    maxLoc: scope.maxLoc,
    allowedPatterns: scope.files,
  })
}
