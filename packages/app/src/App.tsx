import { createSignal, For, Show, onMount } from "solid-js";

interface WorkNotes {
  intent: { what: string; why: string };
  hypothesis: { expected: string; metrics: string[] };
  plan: { steps: string[]; alternatives: string[]; rationale: string };
  scope: { files: string[]; max_files: number; max_loc: number };
  assumptions: string[];
  risks: { technical: string[]; behavioral: string[] };
  status: string;
}

interface AgentMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolCalls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
  toolResults?: {
    success: boolean;
    output: string;
    error?: string;
  }[];
}

interface AgentState {
  agentId: string | null;
  workNotes: WorkNotes | null;
  conversation: AgentMessage[];
  mode: "build" | "plan";
  isLoading: boolean;
  status: "running" | "paused";
}

export function App() {
  const [task, setTask] = createSignal("");
  const [mode, setMode] = createSignal<"build" | "plan">("build");
  const [provider, setProvider] = createSignal("auto");
  const [agent, setAgent] = createSignal<AgentState>({
    agentId: null,
    workNotes: null,
    conversation: [],
    mode: "build",
    isLoading: false,
    status: "running",
  });
  const [activeTab, setActiveTab] = createSignal("chat");

  const startTask = async () => {
    if (!task().trim()) return;

    setAgent((prev) => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch("/api/agent/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task(),
          mode: mode(),
          provider: provider(),
          workDir: ".",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setAgent({
          agentId: data.agentId,
          workNotes: data.workNotes,
          conversation: data.conversation,
          mode: data.mode,
          isLoading: false,
          status: "running",
        });
      } else {
        alert(`Error: ${data.error}`);
        setAgent((prev) => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      alert(`Error: ${error}`);
      setAgent((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const continueExecution = async () => {
    if (!agent().agentId) return;

    setAgent((prev) => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(`/api/agent/${agent().agentId}/continue`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setAgent((prev) => ({
          ...prev,
          conversation: data.conversation,
          workNotes: data.workNotes,
          isLoading: false,
        }));
      } else {
        alert(`Error: ${data.error}`);
        setAgent((prev) => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      alert(`Error: ${error}`);
      setAgent((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const pauseAgent = async () => {
    if (!agent().agentId) return;
    try {
      const response = await fetch(`/api/agent/${agent().agentId}/pause`, {
        method: "POST",
      });
      if (response.ok) {
        setAgent((prev) => ({ ...prev, status: "paused" }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const resumeAgent = async () => {
    if (!agent().agentId) return;
    try {
      const response = await fetch(`/api/agent/${agent().agentId}/resume`, {
        method: "POST",
      });
      if (response.ok) {
        setAgent((prev) => ({ ...prev, status: "running" }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div class="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header class="bg-gray-800 border-b border-gray-700 p-4">
        <div class="max-w-7xl mx-auto flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <i class="fas fa-brain text-white text-xl"></i>
            </div>
            <div>
              <h1 class="text-xl font-bold">CogNito</h1>
              <p class="text-sm text-gray-400">Decision-Aware AI Agent</p>
            </div>
          </div>
          <div class="flex items-center space-x-4">
            <span class="text-sm text-gray-400">
              Mode: <span class="text-green-400 font-medium">{mode()}</span>
            </span>
            <a
              href="https://github.com/AnomalyCo/cognito"
              target="_blank"
              class="text-gray-400 hover:text-white transition"
            >
              <i class="fab fa-github text-xl"></i>
            </a>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto p-6">
        {/* Task Input */}
        <Show when={!agent().agentId}>
          <div class="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
            <h2 class="text-lg font-semibold mb-4">Start a New Task</h2>

            <div class="mb-4">
              <label class="block text-sm text-gray-400 mb-2">
                Task Description
              </label>
              <textarea
                value={task()}
                onInput={(e) => setTask(e.currentTarget.value)}
                placeholder="Describe what you want the agent to do..."
                class="w-full h-32 bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none resize-none"
              />
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label class="block text-sm text-gray-400 mb-2">Mode</label>
                <select
                  value={mode()}
                  onChange={(e) =>
                    setMode(e.currentTarget.value as "build" | "plan")
                  }
                  class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 focus:outline-none"
                >
                  <option value="build">Build (Execute)</option>
                  <option value="plan">Plan (Read-only)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-2">Provider</label>
                <select
                  value={provider()}
                  onChange={(e) => setProvider(e.currentTarget.value)}
                  class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 focus:outline-none"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="openai">OpenAI</option>
                  <option value="chatgpt-plus">ChatGPT Plus</option>
                  <option value="gemini">Gemini (Google)</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="ollama">Ollama (Local)</option>
                </select>
              </div>
            </div>

            <button
              onClick={startTask}
              disabled={!task().trim() || agent().isLoading}
              class="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition flex items-center justify-center space-x-2"
            >
              <Show when={agent().isLoading}>
                <i class="fas fa-spinner fa-spin"></i>
              </Show>
              <Show when={!agent().isLoading}>
                <i class="fas fa-play"></i>
              </Show>
              <span>{agent().isLoading ? "Starting..." : "Start Task"}</span>
            </button>
          </div>
        </Show>

        {/* Active Agent UI */}
        <Show when={agent().agentId}>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar - Work Notes */}
            <div class="lg:col-span-1 space-y-4">
              {/* Status Indicator */}
              <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
                <span class="text-gray-400 font-medium">Agent Status</span>
                <span
                  class={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    agent().status === "paused"
                      ? "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
                      : "bg-green-900/50 text-green-400 border border-green-700"
                  }`}
                >
                  <i
                    class={`fas ${agent().status === "paused" ? "fa-pause" : "fa-circle"} mr-2 text-[10px]`}
                  ></i>
                  {agent().status}
                </span>
              </div>

              <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-semibold flex items-center">
                    <i class="fas fa-clipboard-list text-green-400 mr-2"></i>
                    Work Notes
                  </h3>
                  <span class="text-xs bg-green-900 text-green-400 px-2 py-1 rounded">
                    {agent().workNotes?.status || "active"}
                  </span>
                </div>

                <Show when={agent().workNotes}>
                  {(notes) => (
                    <div class="space-y-4 text-sm">
                      <div>
                        <h4 class="text-gray-400 mb-1">Intent</h4>
                        <p class="font-medium">{notes().intent.what}</p>
                        <p class="text-gray-500 text-xs mt-1">
                          {notes().intent.why}
                        </p>
                      </div>

                      <div>
                        <h4 class="text-gray-400 mb-1">Plan</h4>
                        <ol class="list-decimal list-inside space-y-1">
                          <For each={notes().plan.steps}>
                            {(step, i) => <li class="text-gray-300">{step}</li>}
                          </For>
                        </ol>
                      </div>

                      <div>
                        <h4 class="text-gray-400 mb-1">Scope</h4>
                        <p class="text-xs text-gray-500">
                          Max files: {notes().scope.max_files} | Max LOC:{" "}
                          {notes().scope.max_loc}
                        </p>
                        <div class="flex flex-wrap gap-1 mt-1">
                          <For each={notes().scope.files}>
                            {(file) => (
                              <span class="text-xs bg-gray-700 px-2 py-1 rounded">
                                {file}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>

                      <div>
                        <h4 class="text-gray-400 mb-1">Assumptions</h4>
                        <ul class="list-disc list-inside space-y-1">
                          <For each={notes().assumptions}>
                            {(ass) => (
                              <li class="text-gray-300 text-xs">{ass}</li>
                            )}
                          </For>
                        </ul>
                      </div>
                    </div>
                  )}
                </Show>
              </div>

              {/* Actions */}
              <Show when={agent().mode === "build"}>
                <div class="space-y-3">
                  <button
                    onClick={continueExecution}
                    disabled={agent().isLoading || agent().status === "paused"}
                    class="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition flex items-center justify-center space-x-2"
                  >
                    <Show when={agent().isLoading}>
                      <i class="fas fa-spinner fa-spin"></i>
                    </Show>
                    <Show when={!agent().isLoading}>
                      <i class="fas fa-forward"></i>
                    </Show>
                    <span>
                      {agent().isLoading ? "Running..." : "Continue Execution"}
                    </span>
                  </button>

                  <div class="grid grid-cols-2 gap-3">
                    <button
                      onClick={pauseAgent}
                      disabled={agent().status === "paused"}
                      class="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition flex items-center justify-center"
                    >
                      <i class="fas fa-pause mr-2"></i> Pause
                    </button>
                    <button
                      onClick={resumeAgent}
                      disabled={agent().status === "running"}
                      class="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition flex items-center justify-center"
                    >
                      <i class="fas fa-play mr-2"></i> Resume
                    </button>
                  </div>
                </div>
              </Show>
            </div>

            {/* Main Chat Area */}
            <div class="lg:col-span-2">
              <div class="bg-gray-800 rounded-xl border border-gray-700 h-[600px] flex flex-col">
                {/* Chat Header */}
                <div class="p-4 border-b border-gray-700 flex items-center justify-between">
                  <div class="flex items-center space-x-4">
                    <button
                      onClick={() => setActiveTab("chat")}
                      class={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                        activeTab() === "chat"
                          ? "bg-green-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <i class="fas fa-comments mr-2"></i>Chat
                    </button>
                    <button
                      onClick={() => setActiveTab("yaml")}
                      class={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                        activeTab() === "yaml"
                          ? "bg-green-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <i class="fas fa-code mr-2"></i>YAML
                    </button>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
                    class="text-sm text-gray-400 hover:text-white"
                  >
                    <i class="fas fa-plus mr-1"></i> New Task
                  </button>
                </div>

                {/* Chat Messages */}
                <Show when={activeTab() === "chat"}>
                  <div class="flex-1 overflow-y-auto p-4 space-y-4">
                    <For each={agent().conversation}>
                      {(msg) => (
                        <div
                          class={`fade-in ${
                            msg.role === "user"
                              ? "ml-auto max-w-[80%]"
                              : msg.role === "assistant"
                                ? "max-w-[80%]"
                                : "max-w-full"
                          }`}
                        >
                          <div
                            class={`p-4 rounded-lg ${
                              msg.role === "user"
                                ? "bg-green-600 text-white"
                                : msg.role === "assistant"
                                  ? "bg-gray-700 text-white"
                                  : "bg-gray-900 border border-gray-700 text-gray-400"
                            }`}
                          >
                            <div class="flex items-center justify-between mb-2">
                              <span class="text-xs font-medium opacity-75">
                                {msg.role === "user"
                                  ? "You"
                                  : msg.role === "assistant"
                                    ? "CogNito"
                                    : "Tool"}
                              </span>
                              <span class="text-xs opacity-50">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div class="whitespace-pre-wrap text-sm">
                              {msg.content}
                            </div>

                            {/* Tool Calls */}
                            <Show
                              when={msg.toolCalls && msg.toolCalls.length > 0}
                            >
                              <div class="mt-3 space-y-2">
                                <For each={msg.toolCalls}>
                                  {(tool) => (
                                    <div class="bg-gray-800 rounded p-2 text-xs">
                                      <div class="flex items-center text-blue-400 mb-1">
                                        <i class="fas fa-wrench mr-2"></i>
                                        {tool.function.name}
                                      </div>
                                      <code class="text-gray-500">
                                        {tool.function.arguments.slice(0, 100)}
                                        {tool.function.arguments.length > 100
                                          ? "..."
                                          : ""}
                                      </code>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </Show>

                            {/* Tool Results */}
                            <Show
                              when={
                                msg.toolResults && msg.toolResults.length > 0
                              }
                            >
                              <div class="mt-3 space-y-2">
                                <For each={msg.toolResults}>
                                  {(result) => (
                                    <div
                                      class={`rounded p-2 text-xs ${
                                        result.success
                                          ? "bg-green-900/50 border border-green-700"
                                          : "bg-red-900/50 border border-red-700"
                                      }`}
                                    >
                                      <div class="flex items-center mb-1">
                                        <i
                                          class={`fas ${
                                            result.success
                                              ? "fa-check"
                                              : "fa-times"
                                          } mr-2 ${result.success ? "text-green-400" : "text-red-400"}`}
                                        ></i>
                                        <span
                                          class={
                                            result.success
                                              ? "text-green-400"
                                              : "text-red-400"
                                          }
                                        >
                                          {result.success ? "Success" : "Error"}
                                        </span>
                                      </div>
                                      <code class="text-gray-300 block truncate">
                                        {result.output || result.error}
                                      </code>
                                    </div>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* YAML View */}
                <Show when={activeTab() === "yaml"}>
                  <div class="flex-1 overflow-y-auto p-4">
                    <pre class="bg-gray-900 p-4 rounded-lg text-sm text-green-400 overflow-x-auto">
                      <code>{JSON.stringify(agent().workNotes, null, 2)}</code>
                    </pre>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}
