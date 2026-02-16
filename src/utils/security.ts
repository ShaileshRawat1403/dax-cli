import { resolve, relative, isAbsolute } from "path"

/**
 * Validates and sanitizes a file path to prevent path traversal attacks.
 * 
 * @param filePath - The requested file path (relative or absolute)
 * @param workDir - The allowed working directory (root)
 * @returns The sanitized absolute path or null if invalid
 */
export function sanitizePath(filePath: string, workDir: string): string | null {
  // Normalize paths
  const resolvedWorkDir = resolve(workDir)
  
  // Resolve the file path
  let resolvedPath: string
  if (isAbsolute(filePath)) {
    resolvedPath = filePath
  } else {
    resolvedPath = resolve(resolvedWorkDir, filePath)
  }
  
  // Ensure the resolved path is within the work directory
  const relativePath = relative(resolvedWorkDir, resolvedPath)
  
  // Check for path traversal
  if (relativePath.startsWith("..") || relativePath.startsWith("../")) {
    return null
  }
  
  // Additional checks for suspicious patterns
  const suspiciousPatterns = [
    /\.\./,           // Any occurrence of ..
    /~/,              // Home directory
    /^\/etc\//,       // System directories
    /^\/proc\//,
    /^\/sys\//,
    /^\/dev\//,
    /^\/var\/run\//,
    /^\/tmp\//,
    /^\/root\//,
    /^\/home\//,
    /\.ssh/,
    /\.env$/,
    /\/\.env/,
  ]
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(resolvedPath)) {
      return null
    }
  }
  
  return resolvedPath
}

/**
 * Validates if a file path is safe for read operations.
 */
export function isSafePath(filePath: string, workDir: string): boolean {
  return sanitizePath(filePath, workDir) !== null
}

/**
 * Gets allowed file extensions for security filtering.
 */
export function isAllowedFileType(filePath: string, allowedExtensions?: string[]): boolean {
  if (!allowedExtensions || allowedExtensions.length === 0) {
    return true
  }
  
  const ext = filePath.split(".").pop()?.toLowerCase()
  if (!ext) return false
  
  return allowedExtensions.includes(ext)
}

/**
 * Security check result type.
 */
export interface SecurityCheckResult {
  allowed: boolean
  sanitizedPath?: string
  error?: string
}

/**
 * Comprehensive security check for file operations.
 */
export function checkFileOperation(
  filePath: string,
  workDir: string,
  options?: {
    allowedExtensions?: string[]
    maxPathLength?: number
  }
): SecurityCheckResult {
  // Check path length
  if (options?.maxPathLength && filePath.length > options.maxPathLength) {
    return {
      allowed: false,
      error: `Path exceeds maximum length of ${options.maxPathLength} characters`,
    }
  }
  
  // Sanitize path
  const sanitizedPath = sanitizePath(filePath, workDir)
  if (!sanitizedPath) {
    return {
      allowed: false,
      error: "Path traversal detected or path outside allowed directory",
    }
  }
  
  // Check file extension
  if (options?.allowedExtensions && !isAllowedFileType(filePath, options.allowedExtensions)) {
    return {
      allowed: false,
      error: `File type not allowed. Allowed types: ${options.allowedExtensions.join(", ")}`,
    }
  }
  
  return {
    allowed: true,
    sanitizedPath,
  }
}
