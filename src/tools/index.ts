import { ToolRegistry } from "./types.js"
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  bashTool,
  globTool,
  grepTool,
} from "./file-ops.js"
import {
  analyzeCodeTool,
  gitStatusTool,
  gitDiffTool,
  generateTestsTool,
  scaffoldProjectTool,
  batchEditTool,
  watchFilesTool,
  runExperimentTool,
  checkContractTool,
  checkScopeTool,
} from "./advanced.js"

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()

  // Basic file operations
  registry.register(readFileTool)
  registry.register(writeFileTool)
  registry.register(editFileTool)
  registry.register(listDirTool)
  registry.register(bashTool)
  registry.register(globTool)
  registry.register(grepTool)

  // Advanced features
  registry.register(analyzeCodeTool)
  registry.register(gitStatusTool)
  registry.register(gitDiffTool)
  registry.register(generateTestsTool)
  registry.register(scaffoldProjectTool)
  registry.register(batchEditTool)
  registry.register(watchFilesTool)

  // Validation and experimentation
  registry.register(runExperimentTool)
  registry.register(checkContractTool)
  registry.register(checkScopeTool)

  return registry
}

export function createLocalRegistry(): ToolRegistry {
  // Optimized registry for local models like Phi3
  const registry = new ToolRegistry()
  
  // Essential tools only (local models work better with fewer tools)
  registry.register(readFileTool)
  registry.register(writeFileTool)
  registry.register(editFileTool)
  registry.register(listDirTool)
  registry.register(bashTool)
  registry.register(globTool)
  
  // Add practical features
  registry.register(analyzeCodeTool)
  registry.register(gitStatusTool)
  registry.register(scaffoldProjectTool)
  registry.register(batchEditTool)

  // Validation features
  registry.register(checkContractTool)
  registry.register(checkScopeTool)

  return registry
}

export * from "./types.js"
export * from "./file-ops.js"
export * from "./advanced.js"
