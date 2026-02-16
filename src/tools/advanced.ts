import type { Tool, ToolContext, ToolResult } from "./types.js";

export const analyzeCodeTool: Tool = {
  name: "analyze_code",
  description: "Analyze code structure and provide insights about complexity, dependencies, and patterns",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to file or directory to analyze",
      },
      include_tests: {
        type: "boolean",
        description: "Include test files in analysis",
      },
    },
    required: ["path"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const targetPath = args.path as string;
    const includeTests = args.include_tests as boolean ?? true;

    try {
      const fullPath = `${context.workDir}/${targetPath}`.replace(/\/+/g, "/");
      
      // Get file stats
      const file = Bun.file(fullPath);
      const isDirectory = (await file.stat()).isDirectory();
      
      let analysis = {
        files: [] as string[],
        totalLines: 0,
        codeLines: 0,
        commentLines: 0,
        blankLines: 0,
        functions: 0,
        classes: 0,
        imports: [] as string[],
        complexity: "low" as "low" | "medium" | "high",
      };

      if (isDirectory) {
        // Analyze directory
        const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
        for await (const filePath of glob.scan(fullPath)) {
          if (!includeTests && filePath.includes(".test.")) continue;
          if (!includeTests && filePath.includes(".spec.")) continue;
          
          const fileContent = await Bun.file(`${fullPath}/${filePath}`).text();
          analysis.files.push(filePath);
          
          const lines = fileContent.split("\n");
          analysis.totalLines += lines.length;
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "") {
              analysis.blankLines++;
            } else if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
              analysis.commentLines++;
            } else {
              analysis.codeLines++;
              if (/^function\s+\w+|^const\s+\w+\s*=|^async\s+function/.test(trimmed)) {
                analysis.functions++;
              }
              if (/^class\s+\w+/.test(trimmed)) {
                analysis.classes++;
              }
              if (/^import\s+|^from\s+|^require\(/.test(trimmed)) {
                const match = trimmed.match(/from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/);
                if (match) {
                  const importPath = match[1] || match[2];
                  if (importPath && !analysis.imports.includes(importPath)) {
                    analysis.imports.push(importPath);
                  }
                }
              }
            }
          }
        }
      } else {
        // Analyze single file
        const content = await file.text();
        const lines = content.split("\n");
        analysis.files.push(targetPath);
        analysis.totalLines = lines.length;
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === "") {
            analysis.blankLines++;
          } else if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
            analysis.commentLines++;
          } else {
            analysis.codeLines++;
          }
        }
      }

      // Determine complexity
      if (analysis.files.length > 50 || analysis.totalLines > 5000) {
        analysis.complexity = "high";
      } else if (analysis.files.length > 20 || analysis.totalLines > 2000) {
        analysis.complexity = "medium";
      }

      const output = [
        `📊 Code Analysis for ${targetPath}`,
        "",
        `Files analyzed: ${analysis.files.length}`,
        `Total lines: ${analysis.totalLines}`,
        `Code lines: ${analysis.codeLines}`,
        `Comment lines: ${analysis.commentLines}`,
        `Blank lines: ${analysis.blankLines}`,
        `Functions: ${analysis.functions}`,
        `Classes: ${analysis.classes}`,
        `Complexity: ${analysis.complexity}`,
        "",
        "Key imports:",
        ...analysis.imports.slice(0, 10).map(i => `  - ${i}`),
        analysis.imports.length > 10 ? `  ... and ${analysis.imports.length - 10} more` : "",
      ].join("\n");

      return {
        success: true,
        output,
        metadata: {
          files: analysis.files.length,
          totalLines: analysis.totalLines,
          codeLines: analysis.codeLines,
          complexity: analysis.complexity,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const gitStatusTool: Tool = {
  name: "git_status",
  description: "Check git repository status, including modified files, staged changes, and branch info",
  parameters: {
    type: "object",
    properties: {
      short: {
        type: "boolean",
        description: "Show short format",
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const proc = Bun.spawn(["git", "status", args.short ? "--short" : ""], {
        cwd: context.workDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          success: false,
          output: "",
          error: stderr || "Not a git repository",
        };
      }

      // Get additional info
      const branchProc = Bun.spawn(["git", "branch", "--show-current"], {
        cwd: context.workDir,
        stdout: "pipe",
      });
      const branch = (await new Response(branchProc.stdout).text()).trim();

      const logProc = Bun.spawn(["git", "log", "--oneline", "-5"], {
        cwd: context.workDir,
        stdout: "pipe",
      });
      const recentCommits = await new Response(logProc.stdout).text();

      const output = [
        `📁 Git Status (${branch})`,
        "",
        stdout || "Working tree clean",
        "",
        "Recent commits:",
        recentCommits,
      ].join("\n");

      return {
        success: true,
        output,
        metadata: { branch },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const gitDiffTool: Tool = {
  name: "git_diff",
  description: "Show git diff for staged or unstaged changes",
  parameters: {
    type: "object",
    properties: {
      staged: {
        type: "boolean",
        description: "Show staged changes (--cached)",
      },
      file: {
        type: "string",
        description: "Show diff for specific file only",
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const cmd = ["git", "diff"];
      if (args.staged) cmd.push("--cached");
      if (args.file) cmd.push(args.file as string);

      const proc = Bun.spawn(cmd, {
        cwd: context.workDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return {
          success: false,
          output: "",
          error: stderr,
        };
      }

      return {
        success: true,
        output: stdout || "No changes to show",
        metadata: { hasChanges: stdout.length > 0 },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const generateTestsTool: Tool = {
  name: "generate_tests",
  description: "Generate test file scaffolding for a given source file",
  parameters: {
    type: "object",
    properties: {
      source_file: {
        type: "string",
        description: "Path to the source file to generate tests for",
      },
      framework: {
        type: "string",
        description: "Test framework to use (jest, vitest, bun, etc.)",
        enum: ["jest", "vitest", "bun", "mocha"],
      },
    },
    required: ["source_file"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const sourceFile = args.source_file as string;
    const framework = (args.framework as string) || "bun";

    try {
      const fullPath = `${context.workDir}/${sourceFile}`.replace(/\/+/g, "/");
      const sourceContent = await Bun.file(fullPath).text();

      // Extract function and class names with their parameters
      const functionMatches = sourceContent.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g) || [];
      const classMatches = sourceContent.match(/(?:export\s+)?class\s+(\w+)/g) || [];
      
      // Extract arrow functions
      const arrowFunctionMatches = sourceContent.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]*)\s*=>/g) || [];

      const functions = functionMatches.map(m => {
        const match = m.match(/function\s+(\w+)\s*\(([^)]*)\)/);
        return match ? { name: match[1], params: match[2] } : null;
      }).filter(Boolean) as { name: string, params: string }[];
      
      // Add arrow functions
      const arrowFunctions = arrowFunctionMatches.map(m => {
        const match = m.match(/(?:const|let|var)\s+(\w+)/);
        return match ? { name: match[1], params: '' } : null;
      }).filter(Boolean) as { name: string, params: string }[];
      
      functions.push(...arrowFunctions);
      
      const classes = classMatches.map(m => m.match(/class\s+(\w+)/)?.[1]).filter(Boolean) as string[];
      
      // Parse imports to know what to import
      const importMatches = sourceContent.match(/(?:import|export)\s+(?:type\s+)?{([^}]+)}/g) || [];
      const namedImports = importMatches.flatMap(m => 
        m.match(/{([^}]+)}/)?.[1].split(',').map(s => s.trim().split(' as ')[0].trim()) || []
      );
      
      // Also extract default exports
      const defaultExportMatch = sourceContent.match(/export\s+default\s+(?:function|class)?\s*(\w+)/);
      const hasDefaultExport = !!defaultExportMatch || sourceContent.includes('export default');

      // Generate test file content
      const testFileName = sourceFile.replace(/\.([tj]sx?)$/, ".test.$1");
      const baseImport = sourceFile.replace(/\.([tj]sx?)$/, "");
      
      let testContent = "";
      
      // Build imports list
      const functionNames = functions.map(f => f.name);
      const allImports = [...functionNames, ...classes];
      
      if (framework === "bun") {
        const importLine = allImports.length > 0 
          ? `import { ${allImports.join(", ")} } from "./${baseImport}";`
          : hasDefaultExport 
            ? `import DefaultExport from "./${baseImport}";`
            : `// No exports found in ${sourceFile}`;
        
        const testLines: string[] = [
          `import { describe, it, expect } from "bun:test";`,
          importLine,
          "",
        ];
        
        // Generate tests for functions with meaningful assertions
        for (const fn of functions) {
          const params = fn.params.split(',').filter(p => p.trim()).map(p => p.trim().split(/[:\s=]/)[0]);
          const paramList = params.join(", ");
          const args = params.map(p => getTestValueForParam(p, fn.params)).join(", ");
          
          testLines.push(`describe("${fn.name}", () => {`);
          testLines.push(`  it("should return a defined value with valid inputs", () => {`);
          testLines.push(`    const result = ${fn.name}(${args});`);
          testLines.push(`    expect(result).toBeDefined();`);
          testLines.push(`  });`);
          
          if (params.length > 0) {
            testLines.push(`  `);
            testLines.push(`  it("should handle edge cases gracefully", () => {`);
            testLines.push(`    // Test with boundary values for: ${paramList}`);
            testLines.push(`    expect(() => ${fn.name}()).not.toThrow();`);
            testLines.push(`  });`);
          }
          
          testLines.push(`});`);
          testLines.push("");
        }
        
        // Generate tests for classes
        for (const cls of classes) {
          testLines.push(`describe("${cls}", () => {`);
          testLines.push(`  it("should instantiate without errors", () => {`);
          testLines.push(`    const instance = new ${cls}();`);
          testLines.push(`    expect(instance).toBeDefined();`);
          testLines.push(`    expect(instance).toBeInstanceOf(${cls});`);
          testLines.push(`  });`);
          testLines.push(`});`);
          testLines.push("");
        }
        
        testContent = testLines.join("\n");
      } else if (framework === "vitest") {
        const importLine = allImports.length > 0 
          ? `import { ${allImports.join(", ")} } from "./${baseImport}";`
          : hasDefaultExport 
            ? `import DefaultExport from "./${baseImport}";`
            : `// No exports found in ${sourceFile}`;
        
        const testLines: string[] = [
          `import { describe, it, expect } from "vitest";`,
          importLine,
          "",
        ];
        
        // Generate tests for functions with meaningful assertions
        for (const fn of functions) {
          const params = fn.params.split(',').filter(p => p.trim()).map(p => p.trim().split(/[:\s=]/)[0]);
          const paramList = params.join(", ");
          const args = params.map(p => getTestValueForParam(p, fn.params)).join(", ");
          
          testLines.push(`describe("${fn.name}", () => {`);
          testLines.push(`  it("should return a defined value with valid inputs", () => {`);
          testLines.push(`    const result = ${fn.name}(${args});`);
          testLines.push(`    expect(result).toBeDefined();`);
          testLines.push(`  });`);
          
          if (params.length > 0) {
            testLines.push(`  `);
            testLines.push(`  it("should handle edge cases gracefully", () => {`);
            testLines.push(`    // Test with boundary values for: ${paramList}`);
            testLines.push(`    expect(() => ${fn.name}()).not.toThrow();`);
            testLines.push(`  });`);
          }
          
          testLines.push(`});`);
          testLines.push("");
        }
        
        testContent = testLines.join("\n");
      }
      
      // Helper function to generate appropriate test values based on parameter name and type
      function getTestValueForParam(paramName: string, fullSignature: string): string {
        const lowerName = paramName.toLowerCase();
        const typeMatch = fullSignature.match(new RegExp(`${paramName}\\s*:\\s*([^,=)\\s]+)`));
        const type = typeMatch?.[1]?.toLowerCase() || '';
        
        if (type.includes('string') || lowerName.includes('str') || lowerName.includes('text') || lowerName.includes('name') || lowerName.includes('path') || lowerName.includes('content')) {
          return '"test-value"';
        }
        if (type.includes('number') || lowerName.includes('count') || lowerName.includes('num') || lowerName.includes('index') || lowerName.includes('size')) {
          return '1';
        }
        if (type.includes('boolean') || lowerName.includes('is') || lowerName.includes('has') || lowerName.includes('should') || lowerName.includes('enable')) {
          return 'true';
        }
        if (type.includes('array') || type.includes('[]') || lowerName.includes('list') || lowerName.includes('items') || lowerName.includes('arr')) {
          return '[]';
        }
        if (type.includes('object') || lowerName.includes('obj') || lowerName.includes('config') || lowerName.includes('options')) {
          return '{}';
        }
        if (lowerName.includes('callback') || lowerName.includes('fn') || lowerName.includes('handler')) {
          return '() => {}';
        }
        // Default fallback
        return '"test-value"';
      }

      const testPath = `${context.workDir}/${testFileName}`.replace(/\/+/g, "/");
      await Bun.write(testPath, testContent);

      return {
        success: true,
        output: `Generated test file: ${testFileName}\n\n${testContent}`,
        metadata: {
          testFile: testFileName,
          functions: functions.length,
          classes: classes.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const scaffoldProjectTool: Tool = {
  name: "scaffold_project",
  description: "Create a new project structure with common files and directories",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Project name",
      },
      template: {
        type: "string",
        description: "Project template to use",
        enum: ["basic", "typescript", "react", "api", "cli"],
      },
    },
    required: ["name", "template"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const projectName = args.name as string;
    const template = args.template as string;

    try {
      const projectPath = `${context.workDir}/${projectName}`;
      
      // Create base directories
      const dirs = ["src", "tests", "docs"];
      for (const dir of dirs) {
        await Bun.write(`${projectPath}/${dir}/.gitkeep`, "");
      }

      let files: Record<string, string> = {};

      switch (template) {
        case "typescript":
          files = {
            "package.json": JSON.stringify({
              name: projectName,
              version: "1.0.0",
              type: "module",
              scripts: {
                dev: "bun run src/index.ts",
                test: "bun test",
                build: "tsc",
              },
              devDependencies: {
                "@types/bun": "latest",
                typescript: "^5.0.0",
              },
            }, null, 2),
            "tsconfig.json": JSON.stringify({
              compilerOptions: {
                target: "ESNext",
                module: "ESNext",
                moduleResolution: "bundler",
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                outDir: "./dist",
              },
              include: ["src/**/*"],
            }, null, 2),
            "src/index.ts": `console.log("Hello from ${projectName}!");`,
            "README.md": `# ${projectName}\n\nTypeScript project scaffolded with DAX.`,
          };
          break;

        case "api":
          files = {
            "package.json": JSON.stringify({
              name: projectName,
              version: "1.0.0",
              type: "module",
              scripts: {
                dev: "bun --watch src/index.ts",
                start: "bun src/index.ts",
              },
              dependencies: {
                hono: "^4.0.0",
              },
            }, null, 2),
            "src/index.ts": `import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello from ${projectName}!" }));
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;`,
            "README.md": `# ${projectName}\n\nAPI server scaffolded with DAX.\n\n## Usage\n\n\`\`\`bash\nbun run dev\n\`\`\``,
          };
          break;

        case "cli":
          files = {
            "package.json": JSON.stringify({
              name: projectName,
              version: "1.0.0",
              type: "module",
              bin: {
                [projectName]: "./src/cli.ts",
              },
              scripts: {
                dev: "bun src/cli.ts",
              },
            }, null, 2),
            "src/cli.ts": `#!/usr/bin/env bun

console.log("${projectName} CLI");
console.log("Usage: ${projectName} [command]");`,
            "README.md": `# ${projectName}\n\nCLI tool scaffolded with DAX.`,
          };
          break;

        default: // basic
          files = {
            "package.json": JSON.stringify({
              name: projectName,
              version: "1.0.0",
              type: "module",
            }, null, 2),
            "src/index.js": `console.log("Hello from ${projectName}!");`,
            "README.md": `# ${projectName}`,
          };
      }

      // Write all files
      for (const [filePath, content] of Object.entries(files)) {
        await Bun.write(`${projectPath}/${filePath}`, content);
      }

      return {
        success: true,
        output: `Scaffolded ${template} project: ${projectName}\nCreated:\n${Object.keys(files).map(f => `  - ${f}`).join("\n")}\n  - src/\n  - tests/\n  - docs/`,
        metadata: {
          project: projectName,
          template,
          path: projectPath,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const batchEditTool: Tool = {
  name: "batch_edit",
  description: "Apply edits to multiple files matching a pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match files (e.g., 'src/**/*.ts')",
      },
      search: {
        type: "string",
        description: "Text to search for",
      },
      replace: {
        type: "string",
        description: "Text to replace with",
      },
      preview: {
        type: "boolean",
        description: "Preview changes without applying",
      },
    },
    required: ["pattern", "search", "replace"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const search = args.search as string;
    const replace = args.replace as string;
    const preview = args.preview as boolean ?? false;

    try {
      const glob = new Bun.Glob(pattern);
      const matches: string[] = [];
      const changes: { file: string; count: number }[] = [];

      for await (const filePath of glob.scan(context.workDir)) {
        const fullPath = `${context.workDir}/${filePath}`;
        const content = await Bun.file(fullPath).text();
        
        if (content.includes(search)) {
          matches.push(filePath);
          const count = content.split(search).length - 1;
          changes.push({ file: filePath, count });

          if (!preview) {
            const newContent = content.split(search).join(replace);
            await Bun.write(fullPath, newContent);
          }
        }
      }

      const output = [
        preview ? "🔍 Preview Mode (no changes made)" : "✅ Batch Edit Complete",
        "",
        `Pattern: ${pattern}`,
        `Search: "${search}"`,
        `Replace: "${replace}"`,
        "",
        `Found ${matches.length} file(s) with matches:`,
        ...changes.map(c => `  - ${c.file} (${c.count} occurrence${c.count > 1 ? 's' : ''})`),
      ].join("\n");

      return {
        success: true,
        output,
        metadata: {
          filesChanged: matches.length,
          preview,
          changes,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const watchFilesTool: Tool = {
  name: "watch_files",
  description: "Watch files for changes and run a command (one-time setup)",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "File pattern to watch (e.g., 'src/**/*.ts')",
      },
      command: {
        type: "string",
        description: "Command to run when files change",
      },
    },
    required: ["pattern", "command"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const command = args.command as string;

    try {
      // Create a watcher script
      const watcherScript = `#!/usr/bin/env bun
import { watch } from "fs";

console.log("👀 Watching ${pattern}...");
console.log("Command: ${command}");
console.log("Press Ctrl+C to stop\\n");

const watcher = watch("${context.workDir}", { recursive: true }, async (event, filename) => {
  if (filename && filename.match(/${pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}/)) {
    console.log(\`\\n📝 Change detected: \${filename}\`);
    console.log(\`Running: ${command}\\n\`);
    
    const proc = Bun.spawn("${command}".split(" "), {
      cwd: "${context.workDir}",
      stdout: "inherit",
      stderr: "inherit",
    });
    
    await proc.exited;
    console.log("\\n👀 Watching for changes...");
  }
});

process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});
`;

      const watcherPath = `${context.workDir}/.dax/watcher.ts`;
      await Bun.write(watcherPath, watcherScript);

      return {
        success: true,
        output: `Created file watcher script: .dax/watcher.ts\n\nTo start watching, run:\n  bun ${watcherPath}\n\nPattern: ${pattern}\nCommand: ${command}`,
        metadata: {
          watcherScript: watcherPath,
          pattern,
          command,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const runExperimentTool: Tool = {
  name: "run_experiment",
  description: "Run an A/B experiment to compare two code variants with metrics",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the experiment",
      },
      description: {
        type: "string",
        description: "Description of what is being tested",
      },
      baseline_file: {
        type: "string",
        description: "Path to the baseline (variant A) implementation",
      },
      proposed_file: {
        type: "string",
        description: "Path to the proposed (variant B) implementation",
      },
    },
    required: ["name", "description", "baseline_file", "proposed_file"],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const name = args.name as string;
    const description = args.description as string;
    const baselineFile = args.baseline_file as string;
    const proposedFile = args.proposed_file as string;

    try {
      // Read both variants
      const baselinePath = `${context.workDir}/${baselineFile}`.replace(/\/+/g, "/");
      const proposedPath = `${context.workDir}/${proposedFile}`.replace(/\/+/g, "/");
      
      const baselineContent = await Bun.file(baselinePath).text();
      const proposedContent = await Bun.file(proposedPath).text();

      // Create experiment runner
      const { ExperimentRunner } = await import("../experiment/runner.js");
      const runner = new ExperimentRunner(context.workDir);

      // Create experiment
      const experiment = await runner.createExperiment(
        name,
        description,
        {
          label: "Baseline (A)",
          description: `Current implementation from ${baselineFile}`,
          code: baselineContent,
          filePath: baselineFile,
        },
        {
          label: "Proposed (B)",
          description: `New implementation from ${proposedFile}`,
          code: proposedContent,
          filePath: proposedFile,
        }
      );

      // Run benchmark
      await runner.runBenchmark(experiment.id);

      // Get results
      const report = runner.formatReport(experiment.id);

      return {
        success: true,
        output: report,
        metadata: {
          experimentId: experiment.id,
          status: experiment.status,
          verdict: experiment.verdict,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const checkContractTool: Tool = {
  name: "check_contract",
  description: "Validate code against the repo contract rules",
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to file to validate (optional, checks all if not provided)",
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const filePath = args.file as string | undefined;

    try {
      const { ContractValidator, formatValidationResults } = await import("../contract/validator.js");
      const validator = await ContractValidator.loadFromFile(`${context.workDir}/.dax/contract.yaml`).catch(() => ContractValidator.loadFromFile(`${context.workDir}/.cognito/contract.yaml`));

      if (filePath) {
        // Validate single file
        const fullPath = `${context.workDir}/${filePath}`.replace(/\/+/g, "/");
        const content = await Bun.file(fullPath).text();
        const result = validator.validate(content, filePath);

        return {
          success: result.valid,
          output: formatValidationResults(result),
          metadata: {
            file: filePath,
            violations: result.violations.length,
          },
        };
      } else {
        // Validate all TypeScript/JavaScript files
        const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
        const files: Array<{ path: string; content: string }> = [];

        for await (const path of glob.scan(context.workDir)) {
          const fullPath = `${context.workDir}/${path}`;
          const content = await Bun.file(fullPath).text();
          files.push({ path, content });
        }

        const result = validator.validateBatch(files);

        return {
          success: result.valid,
          output: formatValidationResults(result),
          metadata: {
            filesChecked: files.length,
            violations: result.violations.length,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

export const checkScopeTool: Tool = {
  name: "check_scope",
  description: "Check current scope status and limits",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const { getScopeStatus } = await import("./validation.js");
      const status = getScopeStatus();

      if (!status) {
        return {
          success: true,
          output: "No scope tracking active for this agent.",
        };
      }

      return {
        success: true,
        output: status,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
