import { $ } from "bun"
import type { Tool, ToolContext, ToolResult } from "./types.js"
import { validateWrite, validateEdit, initializeValidation, initializeScopeTracking, getScopeStatus } from "./validation.js"
import { checkFileOperation } from "../utils/security.js"

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file at the specified path",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to read (relative to working directory)",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (0-indexed)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read",
      },
    },
    required: ["path"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const filePath = args.path as string
    const offset = args.offset as number | undefined
    const limit = args.limit as number | undefined

    // Security check
    const securityCheck = checkFileOperation(filePath, context.workDir, {
      allowedExtensions: ["ts", "tsx", "js", "jsx", "json", "md", "txt", "yaml", "yml", "css", "html"],
      maxPathLength: 500,
    })

    if (!securityCheck.allowed) {
      return {
        success: false,
        output: "",
        error: `Security error: ${securityCheck.error}`,
      }
    }

    try {
      const fullPath = securityCheck.sanitizedPath!
      const file = Bun.file(fullPath)

      if (!(await file.exists())) {
        return {
          success: false,
          output: "",
          error: `File not found: ${filePath}`,
        }
      }

      let content = await file.text()

      // Handle offset and limit
      if (offset !== undefined || limit !== undefined) {
        const lines = content.split("\n")
        const start = offset ?? 0
        const end = limit ? start + limit : lines.length
        content = lines.slice(start, end).join("\n")
      }

      return {
        success: true,
        output: content,
        metadata: {
          path: filePath,
          size: content.length,
          lines: content.split("\n").length,
        },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write content to a file at the specified path (creates if doesn't exist)",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to write (relative to working directory)",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const filePath = args.path as string
    const content = args.content as string

    // Security check first
    const securityCheck = checkFileOperation(filePath, context.workDir, {
      maxPathLength: 500,
    })

    if (!securityCheck.allowed) {
      return {
        success: false,
        output: "",
        error: `Security error: ${securityCheck.error}`,
      }
    }

    // Check scope if defined
    if (context.scope) {
      const isAllowed = context.scope.files.some((pattern) => {
        if (pattern.includes("*")) {
          const regex = new RegExp(pattern.replace(/\*/g, ".*"))
          return regex.test(filePath)
        }
        return filePath.startsWith(pattern.replace(/\*$/, ""))
      })

      if (!isAllowed) {
        return {
          success: false,
          output: "",
          error: `File ${filePath} is outside the declared scope. Allowed: ${context.scope.files.join(", ")}`,
        }
      }
    }

    try {
      const fullPath = securityCheck.sanitizedPath!
      
      // Validate before writing
      const validation = await validateWrite(filePath, content, context)
      if (!validation.allowed) {
        return {
          success: false,
          output: "",
          error: `Validation failed: ${validation.reason}`,
        }
      }
      
      await Bun.write(fullPath, content)

      const output = [`Successfully wrote ${content.length} bytes to ${filePath}`]
      if (validation.warnings) {
        output.push("", "⚠️ Warnings:")
        validation.warnings.forEach(w => output.push(`  - ${w}`))
      }
      
      // Show scope status if available
      const scopeStatus = getScopeStatus()
      if (scopeStatus) {
        output.push("", scopeStatus)
      }

      return {
        success: true,
        output: output.join("\n"),
        metadata: {
          path: filePath,
          bytesWritten: content.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const editFileTool: Tool = {
  name: "edit_file",
  description: "Edit a file by replacing oldString with newString",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to edit",
      },
      oldString: {
        type: "string",
        description: "The exact string to find and replace",
      },
      newString: {
        type: "string",
        description: "The new string to replace with",
      },
    },
    required: ["path", "oldString", "newString"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const filePath = args.path as string
    const oldString = args.oldString as string
    const newString = args.newString as string

    // Security check
    const securityCheck = checkFileOperation(filePath, context.workDir, {
      allowedExtensions: ["ts", "tsx", "js", "jsx", "json", "md", "txt", "yaml", "yml", "css", "html"],
      maxPathLength: 500,
    })

    if (!securityCheck.allowed) {
      return {
        success: false,
        output: "",
        error: `Security error: ${securityCheck.error}`,
      }
    }

    try {
      const fullPath = securityCheck.sanitizedPath!
      const file = Bun.file(fullPath)

      if (!(await file.exists())) {
        return {
          success: false,
          output: "",
          error: `File not found: ${filePath}`,
        }
      }

      const content = await file.text()

      if (!content.includes(oldString)) {
        return {
          success: false,
          output: "",
          error: `oldString not found in file. The string must match exactly (including whitespace).`,
        }
      }

      // Count occurrences
      const occurrences = content.split(oldString).length - 1
      if (occurrences > 1) {
        return {
          success: false,
          output: "",
          error: `oldString found ${occurrences} times in file. Please provide more context to make it unique.`,
        }
      }

      const newContent = content.replace(oldString, newString)
      
      // Validate before writing
      const validation = await validateEdit(filePath, content, newContent, context)
      if (!validation.allowed) {
        return {
          success: false,
          output: "",
          error: `Validation failed: ${validation.reason}`,
        }
      }
      
      await Bun.write(fullPath, newContent)

      const output = [`Successfully edited ${filePath}`]
      if (validation.warnings) {
        output.push("", "⚠️ Warnings:")
        validation.warnings.forEach(w => output.push(`  - ${w}`))
      }
      
      // Show scope status if available
      const scopeStatus = getScopeStatus()
      if (scopeStatus) {
        output.push("", scopeStatus)
      }

      return {
        success: true,
        output: output.join("\n"),
        metadata: {
          path: filePath,
          bytesChanged: newString.length - oldString.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const listDirTool: Tool = {
  name: "list_dir",
  description: "List the contents of a directory",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The directory path to list (relative to working directory)",
      },
    },
    required: ["path"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const dirPath = args.path as string

    // Security check
    const securityCheck = checkFileOperation(dirPath, context.workDir, {
      maxPathLength: 500,
    })

    if (!securityCheck.allowed) {
      return {
        success: false,
        output: "",
        error: `Security error: ${securityCheck.error}`,
      }
    }

    try {
      const fullPath = securityCheck.sanitizedPath!
      const entries = []

      // Use proper directory reading
      const files: string[] = []
      const dirs: string[] = []

      try {
        const glob = new Bun.Glob("*")
        for await (const file of glob.scan(fullPath)) {
          const stat = await Bun.file(`${fullPath}/${file}`).stat()
          if (stat.isDirectory()) {
            dirs.push(file + "/")
          } else {
            files.push(file)
          }
        }
      } catch {
        // Fallback if glob doesn't work
        const process = Bun.spawn(["ls", "-la", fullPath])
        const output = await new Response(process.stdout).text()
        return {
          success: true,
          output,
        }
      }

      const output = [
        `Directory: ${dirPath}`,
        "",
        "Directories:",
        ...dirs.map((d) => `  📁 ${d}`),
        "",
        "Files:",
        ...files.map((f) => `  📄 ${f}`),
      ].join("\n")

      return {
        success: true,
        output,
        metadata: {
          path: dirPath,
          files: files.length,
          directories: dirs.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

const FORBIDDEN_COMMANDS = [
  "rm -rf /", "rm -rf /*", "> /dev/sda", "dd if=/dev/zero",
  "mkfs", "format", "fdisk", "del /", "rd /s /q",
  "poweroff", "reboot", "shutdown", "halt", "init 0", "init 6",
  ":(){ :|:& };:", "fork", "while true",
  "chmod -R 777 /", "chmod -R 000 /",
  "mv /* /dev/null", "> ~/.bashrc", "> ~/.zshrc",
  "curl.*| sh", "wget.*| sh", "fetch.*| sh",
  "eval\s*\(", "exec\s*\(", "system\s*\(", "__import__",
]

function validateBashCommand(command: string): { allowed: boolean; error?: string } {
  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_COMMANDS) {
    const regex = new RegExp(pattern, "i")
    if (regex.test(command)) {
      return {
        allowed: false,
        error: `Command contains forbidden pattern: ${pattern}`,
      }
    }
  }

  // Additional safety checks
  if (command.includes("sudo") || command.includes("su -")) {
    return {
      allowed: false,
      error: "Commands with elevated privileges are not allowed",
    }
  }

  if (command.includes("&& rm") || command.includes("; rm")) {
    return {
      allowed: false,
      error: "Destructive operations chained with other commands are not allowed",
    }
  }

  return { allowed: true }
}

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a bash command in the working directory",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      description: {
        type: "string",
        description: "A brief description of what the command does",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 60000, max: 300000)",
      },
    },
    required: ["command", "description"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const command = args.command as string
    const description = args.description as string
    const timeout = Math.min((args.timeout as number) ?? 60000, 300000) // Max 5 minutes

    // Validate command
    const validation = validateBashCommand(command)
    if (!validation.allowed) {
      return {
        success: false,
        output: "",
        error: `Security error: ${validation.error}`,
      }
    }

    try {
      const proc = Bun.spawn(command.split(" "), {
        cwd: context.workDir,
        timeout,
        stdout: "pipe",
        stderr: "pipe",
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        return {
          success: false,
          output: stdout,
          error: stderr || `Command failed with exit code ${exitCode}`,
          metadata: { exitCode },
        }
      }

      return {
        success: true,
        output: stdout || "Command completed successfully (no output)",
        error: stderr || undefined,
        metadata: { exitCode },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const globTool: Tool = {
  name: "glob",
  description: "Find files matching a glob pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The glob pattern to match (e.g., '**/*.ts')",
      },
      path: {
        type: "string",
        description: "The directory to search in (default: working directory)",
      },
    },
    required: ["pattern"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const pattern = args.pattern as string
    const searchPath = (args.path as string) || context.workDir

    try {
      const glob = new Bun.Glob(pattern)
      const matches: string[] = []

      for await (const file of glob.scan(searchPath)) {
        matches.push(file)
      }

      matches.sort()

      return {
        success: true,
        output: matches.length > 0
          ? `Found ${matches.length} file(s):\n${matches.join("\n")}`
          : "No files found matching the pattern",
        metadata: {
          pattern,
          matches: matches.length,
          files: matches,
        },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const grepTool: Tool = {
  name: "grep",
  description: "Search for a pattern in file contents",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The regex pattern to search for",
      },
      path: {
        type: "string",
        description: "The directory to search in (default: working directory)",
      },
      include: {
        type: "string",
        description: "File pattern to include (e.g., '*.ts')",
      },
    },
    required: ["pattern"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const pattern = args.pattern as string
    const searchPath = (args.path as string) || context.workDir
    const include = (args.include as string) || "*"

    try {
      // Use ripgrep if available, otherwise use grep
      const cmd = `rg -n "${pattern}" ${searchPath} --type-add 'custom:${include}' -tcustom 2>/dev/null || grep -rn "${pattern}" ${searchPath} --include="${include}"`

      const proc = Bun.spawn(["sh", "-c", cmd], {
        stdout: "pipe",
        stderr: "pipe",
      })

      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      if (exitCode !== 0 && !stdout) {
        return {
          success: true,
          output: "No matches found",
          metadata: { pattern, matches: 0 },
        }
      }

      const lines = stdout.trim().split("\n").filter(Boolean)

      return {
        success: true,
        output: lines.length > 0
          ? `Found ${lines.length} match(es):\n${lines.slice(0, 50).join("\n")}${lines.length > 50 ? "\n... (truncated)" : ""}`
          : "No matches found",
        metadata: {
          pattern,
          matches: lines.length,
        },
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}
