import { parse } from "yaml"

export interface ContractRule {
  id: string
  category: string
  description: string
  validate: (content: string, filePath: string) => ValidationResult
}

export interface ValidationResult {
  valid: boolean
  violations: Violation[]
}

export interface Violation {
  rule: string
  category: string
  message: string
  line?: number
  severity: "error" | "warning"
}

export interface ContractConfig {
  error_handling?: {
    pattern?: "result" | "throw" | "either"
    require_error_codes?: boolean
    log_at?: "boundary" | "source" | "both"
  }
  testing?: {
    allow_mocks?: boolean
    min_branch_coverage?: number
    test_style?: "behavioral" | "unit" | "integration"
  }
  forbidden?: {
    types?: string[]
    apis?: string[]
    patterns?: string[]
  }
  architecture?: {
    di_only?: boolean
    max_nesting?: number
    no_circular_imports?: boolean
  }
  scope_defaults?: {
    max_files?: number
    max_loc?: number
    require_approval_for_expansion?: boolean
  }
}

export class ContractValidator {
  private config: ContractConfig
  private rules: ContractRule[]

  constructor(config: ContractConfig = {}) {
    this.config = config
    this.rules = this.buildRules()
  }

  static async loadFromFile(filePath: string): Promise<ContractValidator> {
    try {
      const content = await Bun.file(filePath).text()
      const parsed = parse(content)
      return new ContractValidator(parsed.contract || {})
    } catch {
      // Return empty validator if file doesn't exist or is invalid
      return new ContractValidator({})
    }
  }

  private buildRules(): ContractRule[] {
    const rules: ContractRule[] = []

    // Forbidden types rule
    if (this.config.forbidden?.types?.length) {
      const forbiddenTypes = this.config.forbidden.types
      rules.push({
        id: "forbidden-types",
        category: "forbidden",
        description: `Types ${forbiddenTypes.join(", ")} are not allowed`,
        validate: (content: string, filePath: string) => {
          const violations: Violation[] = []
          
          for (const type of forbiddenTypes) {
            // Check for TypeScript 'any' type
            if (type === "any") {
              const regex = /:\s*any\b|\sas\s+any\b/g
              let match
              const lines = content.split("\n")
              
              lines.forEach((line, index) => {
                regex.lastIndex = 0
                if (regex.test(line)) {
                  violations.push({
                    rule: "forbidden-types",
                    category: "forbidden",
                    message: `Use of forbidden type 'any' detected`,
                    line: index + 1,
                    severity: "error",
                  })
                }
              })
            }
          }
          
          return { valid: violations.length === 0, violations }
        },
      })
    }

    // Forbidden APIs rule
    if (this.config.forbidden?.apis?.length) {
      const forbiddenApis = this.config.forbidden.apis
      rules.push({
        id: "forbidden-apis",
        category: "forbidden",
        description: `APIs ${forbiddenApis.join(", ")} are not allowed`,
        validate: (content: string, filePath: string) => {
          const violations: Violation[] = []
          const lines = content.split("\n")
          
          lines.forEach((line, index) => {
            for (const api of forbiddenApis) {
              if (line.includes(api)) {
                violations.push({
                  rule: "forbidden-apis",
                  category: "forbidden",
                  message: `Use of forbidden API '${api}' detected`,
                  line: index + 1,
                  severity: "error",
                })
              }
            }
          })
          
          return { valid: violations.length === 0, violations }
        },
      })
    }

    // Forbidden patterns rule
    if (this.config.forbidden?.patterns?.length) {
      const forbiddenPatterns = this.config.forbidden.patterns
      rules.push({
        id: "forbidden-patterns",
        category: "forbidden",
        description: `Patterns ${forbiddenPatterns.join(", ")} are not allowed`,
        validate: (content: string, filePath: string) => {
          const violations: Violation[] = []
          const lines = content.split("\n")
          
          lines.forEach((line, index) => {
            for (const pattern of forbiddenPatterns) {
              if (pattern === "default export" && /export\s+default/.test(line)) {
                violations.push({
                  rule: "forbidden-patterns",
                  category: "forbidden",
                  message: `Default exports are not allowed. Use named exports instead`,
                  line: index + 1,
                  severity: "error",
                })
              }
            }
          })
          
          return { valid: violations.length === 0, violations }
        },
      })
    }

    // Max nesting rule
    if (this.config.architecture?.max_nesting) {
      const maxNesting = this.config.architecture.max_nesting
      rules.push({
        id: "max-nesting",
        category: "architecture",
        description: `Maximum nesting depth of ${maxNesting} exceeded`,
        validate: (content: string, filePath: string) => {
          const violations: Violation[] = []
          const lines = content.split("\n")
          let currentNesting = 0
          let maxFoundNesting = 0
          
          lines.forEach((line, index) => {
            const openBraces = (line.match(/{/g) || []).length
            const closeBraces = (line.match(/}/g) || []).length
            currentNesting += openBraces - closeBraces
            maxFoundNesting = Math.max(maxFoundNesting, currentNesting)
            
            if (currentNesting > maxNesting) {
              violations.push({
                rule: "max-nesting",
                category: "architecture",
                message: `Nesting depth ${currentNesting} exceeds maximum of ${maxNesting}`,
                line: index + 1,
                severity: "warning",
              })
            }
          })
          
          return { valid: violations.length === 0, violations }
        },
      })
    }

    // No console.log in production
    rules.push({
      id: "no-console-log",
      category: "forbidden",
      description: "console.log statements should not be in production code",
      validate: (content: string, filePath: string) => {
        const violations: Violation[] = []
        
        // Skip test files
        if (filePath.includes(".test.") || filePath.includes(".spec.")) {
          return { valid: true, violations: [] }
        }
        
        const lines = content.split("\n")
        lines.forEach((line, index) => {
          if (/console\.log\(/.test(line)) {
            violations.push({
              rule: "no-console-log",
              category: "forbidden",
              message: `console.log should not be used in production code`,
              line: index + 1,
              severity: "warning",
            })
          }
        })
        
        return { valid: violations.length === 0, violations }
      },
    })

    return rules
  }

  validate(content: string, filePath: string): ValidationResult {
    const allViolations: Violation[] = []
    
    for (const rule of this.rules) {
      const result = rule.validate(content, filePath)
      allViolations.push(...result.violations)
    }
    
    return {
      valid: allViolations.length === 0,
      violations: allViolations,
    }
  }

  validateBatch(files: Array<{ path: string; content: string }>): ValidationResult {
    const allViolations: Violation[] = []
    
    for (const file of files) {
      const result = this.validate(file.content, file.path)
      allViolations.push(...result.violations)
    }
    
    return {
      valid: allViolations.length === 0,
      violations: allViolations,
    }
  }

  getConfig(): ContractConfig {
    return this.config
  }

  getRules(): ContractRule[] {
    return this.rules
  }
}

// Helper function to check if a file should be validated
export function shouldValidateFile(filePath: string): boolean {
  // Only validate TypeScript/JavaScript files
  const validExtensions = [".ts", ".tsx", ".js", ".jsx"]
  return validExtensions.some(ext => filePath.endsWith(ext))
}

// Format validation results for display
export function formatValidationResults(result: ValidationResult): string {
  if (result.valid) {
    return "✅ All contract rules passed"
  }
  
  const lines = ["❌ Contract violations found:"]
  
  for (const violation of result.violations) {
    const lineInfo = violation.line ? `:${violation.line}` : ""
    lines.push(`  [${violation.severity.toUpperCase()}] ${violation.rule}${lineInfo}: ${violation.message}`)
  }
  
  return lines.join("\n")
}
