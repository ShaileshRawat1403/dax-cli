import { ContractValidator, shouldValidateFile, formatValidationResults } from "../contract/validator.js"
import { ScopeTracker, createScopeTracker } from "../scope/tracker.js"
import type { ToolContext } from "./types.js"

// Global instances (these could be moved to a proper DI container)
let contractValidator: ContractValidator | null = null
let scopeTracker: ScopeTracker | null = null
let experimentRunner: unknown = null

export async function initializeValidation(workDir: string): Promise<void> {
  // Load contract validator
  contractValidator = await ContractValidator.loadFromFile(`${workDir}/.dax/contract.yaml`).catch(() => ContractValidator.loadFromFile(`${workDir}/.cognito/contract.yaml`))
}

export function initializeScopeTracking(workDir: string, context: ToolContext): void {
  if (context.scope) {
    scopeTracker = createScopeTracker(workDir, {
      files: context.scope.files,
      maxFiles: context.scope.maxFiles,
      maxLoc: context.scope.maxLoc,
    }) ?? null
    if (scopeTracker) {
      void scopeTracker.initialize()
    }
  }
}

export function initializeExperimentRunner(workDir: string): void {
  void workDir
  experimentRunner = null
}

export async function validateWrite(
  filePath: string,
  content: string,
  context: ToolContext
): Promise<{ allowed: boolean; reason?: string; warnings?: string[] }> {
  const warnings: string[] = []

  // 1. Check scope limits
  if (scopeTracker) {
    await scopeTracker.trackFileChange(filePath, undefined, content)
    const scopeStatus = scopeTracker.getStatus()
    
    if (!scopeStatus.withinLimits) {
      return {
        allowed: false,
        reason: `Scope limits exceeded: ${scopeStatus.warnings.join("; ")}`,
        warnings: scopeStatus.warnings,
      }
    }
    
    warnings.push(...scopeStatus.warnings)
  }

  // 2. Validate against contract
  if (contractValidator && shouldValidateFile(filePath)) {
    const validation = contractValidator.validate(content, filePath)
    
    if (!validation.valid) {
      const errorViolations = validation.violations.filter(v => v.severity === "error")
      
      if (errorViolations.length > 0) {
        return {
          allowed: false,
          reason: `Contract violations found:\n${formatValidationResults(validation)}`,
          warnings: validation.violations.map(v => v.message),
        }
      }
      
      // Add warnings for non-error violations
      warnings.push(...validation.violations.map(v => v.message))
    }
  }

  return { allowed: true, warnings: warnings.length > 0 ? warnings : undefined }
}

export async function validateEdit(
  filePath: string,
  oldContent: string,
  newContent: string,
  context: ToolContext
): Promise<{ allowed: boolean; reason?: string; warnings?: string[] }> {
  return validateWrite(filePath, newContent, context)
}

export function getContractValidator(): ContractValidator | null {
  return contractValidator
}

export function getScopeTracker(): ScopeTracker | null {
  return scopeTracker
}

export function getExperimentRunner(): unknown {
  return experimentRunner
}

// Format scope status for display
export function getScopeStatus(): string | null {
  if (!scopeTracker) {
    return null
  }
  return scopeTracker.formatStatus()
}
