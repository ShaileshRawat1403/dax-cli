import { Component, createSignal } from "solid-js";

const InteractiveWorkspace: Component = () => {
  const [activeTab, setActiveTab] = createSignal("plan");

  return (
    <div class="fixed inset-0 bg-surface-950 z-50 flex flex-col p-4 md:p-8 font-sans">
      <div class="flex-shrink-0 mb-4">
        <h1 class="text-2xl font-bold text-white">DAX Workspace</h1>
        <p class="text-gray-400">Awaiting your instructions...</p>
      </div>

      {/* Main content area */}
      <div class="flex-1 bg-surface-900 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
        {/* Tabs for different outputs */}
        <div class="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab("plan")}
            class="px-4 py-2 text-sm"
            classList={{
              "text-white bg-surface-800": activeTab() === "plan",
              "text-gray-400 hover:bg-surface-850": activeTab() !== "plan",
            }}
          >
            Plan
          </button>
          <button
            onClick={() => setActiveTab("code")}
            class="px-4 py-2 text-sm"
            classList={{
              "text-white bg-surface-800": activeTab() === "code",
              "text-gray-400 hover:bg-surface-850": activeTab() !== "code",
            }}
          >
            Code
          </button>
          <button
            onClick={() => setActiveTab("tests")}
            class="px-4 py-2 text-sm"
            classList={{
              "text-white bg-surface-800": activeTab() === "tests",
              "text-gray-400 hover:bg-surface-850": activeTab() !== "tests",
            }}
          >
            Tests
          </button>
        </div>

        {/* Tab Content */}
        <div class="flex-1 p-4 overflow-auto font-mono text-sm text-gray-300">
          {activeTab() === "plan" && (
            <div>
              <p class="text-gray-500">// The agent's plan will appear here.</p>
            </div>
          )}
          {activeTab() === "code" && (
            <div>
              <p class="text-gray-500">
                // Generated code changes will appear here.
              </p>
            </div>
          )}
          {activeTab() === "tests" && (
            <div>
              <p class="text-gray-500">// Generated tests will appear here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      <div class="flex-shrink-0 mt-4">
        <textarea
          class="w-full p-3 bg-surface-850 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-cognito-500 focus:outline-none"
          rows="3"
          placeholder="Tell DAX what to do... e.g., 'Refactor the user authentication to use a service class.'"
        ></textarea>
        <div class="mt-2 flex justify-end gap-2">
          <button class="glass hover:border-cognito-500/30 text-gray-300 font-medium px-4 py-2 rounded-lg transition text-sm">
            Attach File
          </button>
          <button class="bg-cognito-600 hover:bg-cognito-500 text-white font-medium px-6 py-2 rounded-lg transition text-sm">
            Execute
          </button>
        </div>
      </div>
    </div>
  );
};

export default InteractiveWorkspace;
