import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('/api/*', cors())

// ─── API Routes ───

// Work Notes CRUD
app.get('/api/work-notes', (c) => {
  return c.json({
    notes: [
      {
        id: 'wn-001',
        created: '2026-02-09T10:00:00Z',
        intent: {
          what: 'Refactor authentication middleware to support JWT and session-based auth',
          why: 'Current system only supports JWT, but enterprise clients need session support'
        },
        hypothesis: {
          expected: 'Dual auth support with zero regression on existing JWT flow',
          metrics: ['All 47 auth tests pass', 'No latency increase > 5ms', 'Session cleanup < 100ms']
        },
        plan: {
          steps: [
            'Create AuthStrategy interface',
            'Implement JWTStrategy (extract from current)',
            'Implement SessionStrategy',
            'Add strategy resolver middleware',
            'Update route guards'
          ],
          alternatives: ['Passport.js adapter', 'Separate auth endpoints'],
          rationale: 'Strategy pattern keeps existing code intact while adding extensibility'
        },
        scope: { files: ['src/auth/*', 'src/middleware/guard.ts'], max_files: 6, max_loc: 200 },
        assumptions: [
          'Redis is available for session storage',
          'Existing JWT tokens remain valid during migration',
          'No breaking changes to /api/auth/* responses'
        ],
        risks: {
          technical: ['Session fixation if not properly regenerated', 'Memory leak if sessions not cleaned'],
          behavioral: ['Existing clients may need to handle Set-Cookie headers']
        },
        status: 'in_progress'
      }
    ]
  })
})

// Decision Log
app.get('/api/decisions', (c) => {
  return c.json({
    decisions: [
      {
        id: 'dec-001',
        timestamp: '2026-02-09T10:30:00Z',
        context: 'Authentication refactor - choosing auth strategy pattern',
        decision: 'Strategy pattern over middleware chain',
        rationale: 'Strategy pattern allows runtime selection and is easier to test in isolation',
        alternatives: [
          { name: 'Middleware chain', reason_rejected: 'Order-dependent, harder to test' },
          { name: 'Passport.js', reason_rejected: 'Heavy dependency, most features unused' }
        ],
        confidence: 'high',
        reversible: true
      }
    ]
  })
})

// Experiments
app.get('/api/experiments', (c) => {
  return c.json({
    experiments: [
      {
        id: 'exp-001',
        name: 'Auth middleware performance comparison',
        status: 'completed',
        variant_a: {
          label: 'Baseline (JWT only)',
          description: 'Current production JWT middleware',
          metrics: { avg_latency: '12ms', p99_latency: '45ms', memory: '2.1MB', tests_passed: '47/47' }
        },
        variant_b: {
          label: 'Proposed (Strategy pattern)',
          description: 'New dual-auth with strategy resolver',
          metrics: { avg_latency: '14ms', p99_latency: '48ms', memory: '2.3MB', tests_passed: '52/52' }
        },
        deltas: {
          avg_latency: '+2ms (+16.7%)',
          p99_latency: '+3ms (+6.7%)',
          memory: '+0.2MB (+9.5%)',
          tests_passed: '+5 new tests'
        },
        verdict: 'Acceptable regression. +2ms avg latency is within budget. 5 new tests improve coverage.'
      }
    ]
  })
})

// Repo Contracts
app.get('/api/contracts', (c) => {
  return c.json({
    contracts: {
      error_handling: {
        rules: ['Use Result<T, E> pattern, never throw', 'All errors must have error codes', 'Log at boundary, not at source'],
        enforced: true
      },
      test_conventions: {
        rules: ['No mocks - use real implementations', 'Test behavior, not implementation', 'Minimum 80% branch coverage'],
        enforced: true
      },
      forbidden_patterns: {
        rules: ['No any types', 'No console.log in production', 'No synchronous file I/O', 'No default exports in library code'],
        enforced: true
      },
      architecture: {
        rules: ['Dependency injection only', 'No circular imports', 'Maximum 3 levels of nesting'],
        enforced: true
      }
    }
  })
})

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', agent: 'cognito', version: '1.0.0' })
})

// ─── Main Page ───
app.get('/', (c) => {
  return c.html(renderPage())
})

// ─── Docs Pages ───
app.get('/docs', (c) => c.html(renderPage()))
app.get('/docs/:page', (c) => c.html(renderPage()))

function renderPage() {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CogNito - Decision-Aware AI Coding Agent</title>
  <meta name="description" content="CogNito is an open source, decision-aware AI coding agent that makes reasoning, assumptions, risks, and tradeoffs explicit, reviewable, and controllable.">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            cognito: {
              50: '#f0fdf4',
              100: '#dcfce7',
              200: '#bbf7d0',
              300: '#86efac',
              400: '#4ade80',
              500: '#22c55e',
              600: '#16a34a',
              700: '#15803d',
              800: '#166534',
              900: '#14532d',
              950: '#052e16',
            },
            surface: {
              50: '#fafafa',
              100: '#f5f5f5',
              200: '#e5e5e5',
              700: '#1a1a2e',
              800: '#16162a',
              850: '#111126',
              900: '#0d0d1f',
              950: '#08081a',
            }
          }
        }
      }
    }
  </script>
  <style>
    * { scrollbar-width: thin; scrollbar-color: #333 transparent; }
    ::selection { background: #22c55e33; color: #22c55e; }
    .glow { box-shadow: 0 0 60px rgba(34, 197, 94, 0.15), 0 0 120px rgba(34, 197, 94, 0.05); }
    .glow-text { text-shadow: 0 0 40px rgba(34, 197, 94, 0.3); }
    .glass { background: rgba(26, 26, 46, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(34, 197, 94, 0.1); }
    .glass-strong { background: rgba(26, 26, 46, 0.85); backdrop-filter: blur(20px); border: 1px solid rgba(34, 197, 94, 0.15); }
    .code-block { background: #0d0d1f; border: 1px solid rgba(34, 197, 94, 0.1); }
    .animate-float { animation: float 6s ease-in-out infinite; }
    @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
    .grid-bg { background-image: radial-gradient(rgba(34,197,94,0.05) 1px, transparent 1px); background-size: 40px 40px; }
    .fade-in { animation: fadeIn 0.6s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .nav-active { color: #22c55e; border-bottom: 2px solid #22c55e; }
    .tab-active { background: rgba(34, 197, 94, 0.15); color: #22c55e; border-color: rgba(34, 197, 94, 0.3); }
    .metric-card:hover { border-color: rgba(34, 197, 94, 0.4); transform: translateY(-2px); }
    .yaml-key { color: #22c55e; }
    .yaml-value { color: #a5f3fc; }
    .yaml-comment { color: #4b5563; }
    .yaml-string { color: #fbbf24; }
    .pulse-dot { animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .hero-gradient { background: linear-gradient(135deg, #052e16 0%, #0d0d1f 40%, #0d0d1f 60%, #14532d 100%); }
    .section-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(34,197,94,0.2), transparent); }
  </style>
</head>
<body class="bg-surface-950 text-gray-200 font-sans min-h-screen">
  <!-- Background grid -->
  <div class="fixed inset-0 grid-bg pointer-events-none z-0"></div>

  <!-- Navigation -->
  <nav class="fixed top-0 w-full z-50 glass-strong">
    <div class="max-w-7xl mx-auto px-4 sm:px-6">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-3 cursor-pointer" onclick="navigate('hero')">
          <div class="w-8 h-8 bg-cognito-500 rounded-lg flex items-center justify-center font-mono font-bold text-surface-950 text-sm">C</div>
          <span class="font-bold text-lg tracking-tight">Cog<span class="text-cognito-400">Nito</span></span>
        </div>
        <div class="hidden md:flex items-center gap-1">
          <button onclick="navigate('features')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Features</button>
          <button onclick="navigate('work-notes')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Work Notes</button>
          <button onclick="navigate('decisions')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Decisions</button>
          <button onclick="navigate('experiments')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Experiments</button>
          <button onclick="navigate('contracts')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Contracts</button>
          <button onclick="navigate('install')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Install</button>
          <button onclick="navigate('contributing')" class="nav-btn px-3 py-2 text-sm text-gray-400 hover:text-cognito-400 transition rounded-md">Contribute</button>
        </div>
        <div class="flex items-center gap-3">
          <a href="https://github.com/AnomalyCo/cognito" target="_blank" class="text-gray-400 hover:text-white transition">
            <i class="fab fa-github text-xl"></i>
          </a>
          <a href="#install" onclick="navigate('install')" class="bg-cognito-600 hover:bg-cognito-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            Get Started
          </a>
        </div>
      </div>
    </div>
  </nav>

  <main class="relative z-10">
    <!-- ===== HERO ===== -->
    <section id="hero" class="hero-gradient min-h-screen flex items-center pt-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-16 items-center">
        <div class="fade-in">
          <div class="inline-flex items-center gap-2 glass px-3 py-1.5 rounded-full text-xs text-cognito-400 mb-6">
            <span class="w-2 h-2 bg-cognito-500 rounded-full pulse-dot"></span>
            Open Source &middot; MIT Licensed
          </div>
          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            <span class="text-white">Cog</span><span class="text-cognito-400 glow-text">Nito</span>
          </h1>
          <p class="text-xl sm:text-2xl text-gray-400 leading-relaxed mb-4 max-w-xl">
            The decision-aware AI coding agent for <span class="text-white font-medium">professional developers</span>.
          </p>
          <p class="text-base text-gray-500 leading-relaxed mb-8 max-w-lg">
            Your AI collaborator that makes reasoning, assumptions, risks, and tradeoffs explicit, reviewable, and controllable. Not an autopilot &mdash; a thinking partner.
          </p>
          <div class="flex flex-wrap gap-4 mb-10">
            <button onclick="navigate('install')" class="bg-cognito-600 hover:bg-cognito-500 text-white font-semibold px-6 py-3 rounded-xl transition glow flex items-center gap-2">
              <i class="fas fa-download"></i> Install CogNito
            </button>
            <button onclick="navigate('work-notes')" class="glass hover:border-cognito-500/30 text-gray-300 font-medium px-6 py-3 rounded-xl transition flex items-center gap-2">
              <i class="fas fa-brain"></i> See It Think
            </button>
          </div>
          <div class="flex items-center gap-6 text-sm text-gray-500">
            <span class="flex items-center gap-2"><i class="fas fa-check text-cognito-500"></i> Provider-agnostic</span>
            <span class="flex items-center gap-2"><i class="fas fa-check text-cognito-500"></i> Built-in LSP</span>
            <span class="flex items-center gap-2"><i class="fas fa-check text-cognito-500"></i> TUI + Desktop</span>
          </div>
        </div>
        <div class="fade-in hidden lg:block">
          <div class="code-block rounded-2xl p-1 glow">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-800/50">
              <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-red-500/60"></div>
                <div class="w-3 h-3 rounded-full bg-yellow-500/60"></div>
                <div class="w-3 h-3 rounded-full bg-green-500/60"></div>
              </div>
              <span class="text-xs text-gray-500 ml-2 font-mono">cognito work_notes</span>
            </div>
            <pre class="p-5 text-sm font-mono leading-relaxed overflow-x-auto"><code><span class="yaml-key">work_notes</span>:
  <span class="yaml-key">intent</span>:
    <span class="yaml-key">what</span>: <span class="yaml-string">"Refactor auth to support dual strategy"</span>
    <span class="yaml-key">why</span>:  <span class="yaml-string">"Enterprise needs session-based auth"</span>
  <span class="yaml-key">hypothesis</span>:
    <span class="yaml-key">expected</span>: <span class="yaml-string">"Zero regression on JWT flow"</span>
    <span class="yaml-key">metrics</span>:
      - <span class="yaml-value">All 47 tests pass</span>
      - <span class="yaml-value">Latency &lt; +5ms</span>
  <span class="yaml-key">scope</span>:
    <span class="yaml-key">files</span>: <span class="yaml-value">src/auth/*</span>
    <span class="yaml-key">max_loc</span>: <span class="yaml-value">200</span>
  <span class="yaml-key">risks</span>:
    <span class="yaml-key">technical</span>: <span class="yaml-string">"Session fixation"</span>
    <span class="yaml-key">behavioral</span>: <span class="yaml-string">"Set-Cookie header changes"</span>
  <span class="yaml-key">status</span>: <span class="text-yellow-400">in_progress</span> <span class="yaml-comment"># scope locked</span></code></pre>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== WHAT MAKES COGNITO DIFFERENT ===== -->
    <section id="features" class="py-24 px-4 sm:px-6">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Why CogNito?</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Most AI agents act like autopilots. CogNito acts like a thinking collaborator. Every decision is explicit, every tradeoff is documented, and you stay in control.</p>
        </div>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Feature Cards -->
          <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
            <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
              <i class="fas fa-clipboard-list text-cognito-400 text-xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Structured Work Notes</h3>
            <p class="text-gray-400 text-sm leading-relaxed">Every task gets a mandatory work notes structure: intent, hypothesis, plan, scope, assumptions, risks, changes, tests, metrics, and decision log.</p>
          </div>
          <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
            <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
              <i class="fas fa-lock text-cognito-400 text-xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Sacred Scope</h3>
            <p class="text-gray-400 text-sm leading-relaxed">Declare your scope. Lock it. If the agent needs to exceed it, it stops and asks. No more surprise changes to files you didn't authorize.</p>
          </div>
          <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
            <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
              <i class="fas fa-flask text-cognito-400 text-xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Experimentation Mode</h3>
            <p class="text-gray-400 text-sm leading-relaxed">Compare Variant A vs Variant B with identical tests. See deltas clearly. The agent never silently replaces your baseline.</p>
          </div>
          <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
            <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
              <i class="fas fa-file-contract text-cognito-400 text-xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Repo Contracts</h3>
            <p class="text-gray-400 text-sm leading-relaxed">Define your project's rules: error handling, test conventions, forbidden APIs. CogNito validates all output against them.</p>
          </div>
          <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
            <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
              <i class="fas fa-puzzle-piece text-cognito-400 text-xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Partial Acceptance</h3>
            <p class="text-gray-400 text-sm leading-relaxed">Accept the plan but reject the code. Keep tests but discard the refactor. Request a smaller diff. Outputs are separated into PLAN, CODE, TESTS, METRICS.</p>
          </div>
          <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
            <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
              <i class="fas fa-stop-circle text-cognito-400 text-xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-white mb-2">Fail-Safe Behavior</h3>
            <p class="text-gray-400 text-sm leading-relaxed">If scope is exceeded, assumptions fail, metrics regress, or tests contradict intent: the agent STOPS and explains. Never continues autonomously.</p>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== CORE PRINCIPLES ===== -->
    <section class="py-24 px-4 sm:px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Core Operating Principles</h2>
          <p class="text-gray-400 max-w-xl mx-auto">CogNito follows five non-negotiable principles that set it apart from every other AI coding agent.</p>
        </div>
        <div class="space-y-6">
          <div class="glass rounded-xl p-6 flex gap-6 items-start">
            <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-cognito-400 font-bold font-mono">1</span>
            </div>
            <div>
              <h3 class="text-white font-semibold text-lg mb-1">Think in Plans, Not Actions</h3>
              <p class="text-gray-400 text-sm">Before writing or modifying any code, CogNito generates a structured plan. It will not execute code changes unless the plan is complete and internally consistent.</p>
            </div>
          </div>
          <div class="glass rounded-xl p-6 flex gap-6 items-start">
            <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-cognito-400 font-bold font-mono">2</span>
            </div>
            <div>
              <h3 class="text-white font-semibold text-lg mb-1">Explain Before Act</h3>
              <p class="text-gray-400 text-sm">Every change comes with: what will change, why it's needed, what alternatives exist, and what could break. If it can't explain a decision clearly, it asks for clarification.</p>
            </div>
          </div>
          <div class="glass rounded-xl p-6 flex gap-6 items-start">
            <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-cognito-400 font-bold font-mono">3</span>
            </div>
            <div>
              <h3 class="text-white font-semibold text-lg mb-1">Scope is Sacred</h3>
              <p class="text-gray-400 text-sm">CogNito never exceeds the declared change scope. If the task requires expanding scope, it stops and requests approval. No side-effects, no surprises.</p>
            </div>
          </div>
          <div class="glass rounded-xl p-6 flex gap-6 items-start">
            <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-cognito-400 font-bold font-mono">4</span>
            </div>
            <div>
              <h3 class="text-white font-semibold text-lg mb-1">Assumptions Must Be Declared</h3>
              <p class="text-gray-400 text-sm">Any assumption CogNito relies on is explicitly stated. If an assumption becomes invalid during execution, it stops and re-plans rather than proceeding on shaky ground.</p>
            </div>
          </div>
          <div class="glass rounded-xl p-6 flex gap-6 items-start">
            <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-cognito-400 font-bold font-mono">5</span>
            </div>
            <div>
              <h3 class="text-white font-semibold text-lg mb-1">Code Changes Are Experiments</h3>
              <p class="text-gray-400 text-sm">Non-trivial changes are treated as hypotheses. CogNito compares outcomes, not just correctness. This is how professional engineering works.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== WORK NOTES (Interactive) ===== -->
    <section id="work-notes" class="py-24 px-4 sm:px-6">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Structured Work Notes</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">Every task CogNito works on produces a complete work notes artifact. This is mandatory output &mdash; no free-form reasoning allowed.</p>
        </div>
        <div class="grid lg:grid-cols-2 gap-8">
          <!-- YAML View -->
          <div class="code-block rounded-2xl overflow-hidden">
            <div class="flex items-center justify-between px-5 py-3 border-b border-gray-800/50">
              <span class="text-xs text-gray-500 font-mono">work_notes.yaml</span>
              <div class="flex gap-2">
                <button id="btn-yaml" onclick="showWorkNotesView('yaml')" class="text-xs px-3 py-1 rounded-md tab-active">YAML</button>
                <button id="btn-visual" onclick="showWorkNotesView('visual')" class="text-xs px-3 py-1 rounded-md text-gray-400 hover:text-white border border-transparent">Visual</button>
              </div>
            </div>
            <div id="work-notes-yaml" class="p-5 text-sm font-mono leading-relaxed overflow-auto max-h-[600px]">
<pre><code><span class="yaml-key">work_notes</span>:
  <span class="yaml-key">intent</span>:
    <span class="yaml-key">what_im_trying_to_do</span>: <span class="yaml-string">"Refactor authentication middleware"</span>
    <span class="yaml-key">why_this_matters</span>: <span class="yaml-string">"Enterprise clients need session support"</span>

  <span class="yaml-key">hypothesis</span>:
    <span class="yaml-key">expected_outcome</span>: <span class="yaml-string">"Dual auth with zero JWT regression"</span>
    <span class="yaml-key">success_metrics</span>:
      - <span class="yaml-value">"All 47 auth tests pass"</span>
      - <span class="yaml-value">"No latency increase > 5ms"</span>
      - <span class="yaml-value">"Session cleanup < 100ms"</span>

  <span class="yaml-key">plan</span>:
    <span class="yaml-key">steps</span>:
      - <span class="yaml-value">Create AuthStrategy interface</span>
      - <span class="yaml-value">Implement JWTStrategy (extract current)</span>
      - <span class="yaml-value">Implement SessionStrategy</span>
      - <span class="yaml-value">Add strategy resolver middleware</span>
      - <span class="yaml-value">Update route guards</span>
    <span class="yaml-key">alternatives_considered</span>:
      - <span class="yaml-value">Passport.js adapter</span>
      - <span class="yaml-value">Separate auth endpoints</span>
    <span class="yaml-key">rationale</span>: <span class="yaml-string">"Strategy pattern preserves existing code"</span>

  <span class="yaml-key">scope</span>:
    <span class="yaml-key">allowed_files</span>: <span class="yaml-value">["src/auth/*", "src/middleware/guard.ts"]</span>
    <span class="yaml-key">max_files</span>: <span class="yaml-value">6</span>
    <span class="yaml-key">max_loc</span>: <span class="yaml-value">200</span>

  <span class="yaml-key">assumptions</span>:
    - <span class="yaml-value">Redis available for session storage</span>
    - <span class="yaml-value">JWT tokens remain valid during migration</span>
    - <span class="yaml-value">No breaking changes to /api/auth/* responses</span>

  <span class="yaml-key">risks</span>:
    <span class="yaml-key">technical</span>:
      - <span class="yaml-value">Session fixation if not regenerated</span>
      - <span class="yaml-value">Memory leak if sessions not cleaned</span>
    <span class="yaml-key">behavioral</span>:
      - <span class="yaml-value">Clients may need Set-Cookie handling</span>

  <span class="yaml-key">decision_log</span>:
    <span class="yaml-key">why_this_approach</span>: <span class="yaml-string">"Strategy pattern is testable in isolation"</span>

  <span class="yaml-key">next_steps</span>:
    <span class="yaml-key">will_try_next</span>: <span class="yaml-string">"Implement SessionStrategy"</span>
    <span class="yaml-key">requires_approval</span>: <span class="yaml-string">"Adding redis dependency"</span></code></pre>
            </div>
            <div id="work-notes-visual" class="p-5 hidden max-h-[600px] overflow-auto">
              <div class="space-y-4">
                <div class="bg-surface-900 rounded-lg p-4 border border-gray-800">
                  <div class="flex items-center gap-2 mb-2">
                    <i class="fas fa-bullseye text-cognito-400"></i>
                    <span class="text-sm font-semibold text-white">Intent</span>
                  </div>
                  <p class="text-sm text-gray-300">Refactor authentication middleware to support JWT and session-based auth</p>
                  <p class="text-xs text-gray-500 mt-1">Enterprise clients need session support alongside existing JWT flow</p>
                </div>
                <div class="bg-surface-900 rounded-lg p-4 border border-gray-800">
                  <div class="flex items-center gap-2 mb-2">
                    <i class="fas fa-chart-line text-blue-400"></i>
                    <span class="text-sm font-semibold text-white">Hypothesis</span>
                  </div>
                  <p class="text-sm text-gray-300">Dual auth with zero regression on existing JWT flow</p>
                  <div class="flex flex-wrap gap-2 mt-2">
                    <span class="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded">47 tests pass</span>
                    <span class="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded">Latency &lt; +5ms</span>
                    <span class="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded">Cleanup &lt; 100ms</span>
                  </div>
                </div>
                <div class="bg-surface-900 rounded-lg p-4 border border-gray-800">
                  <div class="flex items-center gap-2 mb-2">
                    <i class="fas fa-list-ol text-green-400"></i>
                    <span class="text-sm font-semibold text-white">Plan</span>
                    <span class="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded ml-auto">5 steps</span>
                  </div>
                  <ol class="text-sm text-gray-300 space-y-1.5 ml-4 list-decimal">
                    <li>Create AuthStrategy interface</li>
                    <li>Implement JWTStrategy (extract current)</li>
                    <li>Implement SessionStrategy</li>
                    <li>Add strategy resolver middleware</li>
                    <li>Update route guards</li>
                  </ol>
                </div>
                <div class="bg-surface-900 rounded-lg p-4 border border-red-900/30">
                  <div class="flex items-center gap-2 mb-2">
                    <i class="fas fa-exclamation-triangle text-red-400"></i>
                    <span class="text-sm font-semibold text-white">Risks</span>
                  </div>
                  <div class="space-y-1">
                    <p class="text-sm text-red-300">Session fixation if not properly regenerated</p>
                    <p class="text-sm text-red-300">Memory leak if sessions not cleaned up</p>
                    <p class="text-sm text-yellow-300">Clients may need to handle Set-Cookie headers</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Explanation cards -->
          <div class="space-y-4">
            <div class="glass rounded-xl p-5">
              <h4 class="text-white font-semibold mb-3 flex items-center gap-2">
                <i class="fas fa-bullseye text-cognito-400"></i> Intent
              </h4>
              <p class="text-gray-400 text-sm mb-2"><strong class="text-gray-300">what_im_trying_to_do</strong> &mdash; Clear statement of the task objective. No ambiguity.</p>
              <p class="text-gray-400 text-sm"><strong class="text-gray-300">why_this_matters</strong> &mdash; Business context. Without this, the agent is coding blind.</p>
            </div>
            <div class="glass rounded-xl p-5">
              <h4 class="text-white font-semibold mb-3 flex items-center gap-2">
                <i class="fas fa-chart-line text-blue-400"></i> Hypothesis &amp; Metrics
              </h4>
              <p class="text-gray-400 text-sm">Every change is a hypothesis. Define what success looks like <em>before</em> writing code. Measurable metrics prevent optimism bias.</p>
            </div>
            <div class="glass rounded-xl p-5">
              <h4 class="text-white font-semibold mb-3 flex items-center gap-2">
                <i class="fas fa-lock text-yellow-400"></i> Scope Lock
              </h4>
              <p class="text-gray-400 text-sm">Declare allowed files, max files, and max lines of code. If the agent detects it needs to exceed these limits, it halts execution and requests explicit approval.</p>
            </div>
            <div class="glass rounded-xl p-5">
              <h4 class="text-white font-semibold mb-3 flex items-center gap-2">
                <i class="fas fa-exclamation-triangle text-red-400"></i> Risks &amp; Assumptions
              </h4>
              <p class="text-gray-400 text-sm">Technical risks get surfaced upfront. Assumptions are declared explicitly. When assumptions become invalid mid-execution, the agent stops and re-plans.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== DECISION LOG ===== -->
    <section id="decisions" class="py-24 px-4 sm:px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Decision Log</h2>
          <p class="text-gray-400 max-w-xl mx-auto">Every architectural and implementation decision is logged with rationale, alternatives considered, and confidence level.</p>
        </div>
        <div class="glass rounded-2xl overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between">
            <span class="text-sm font-mono text-gray-400">decision_log &middot; 1 entry</span>
            <span class="text-xs bg-cognito-500/10 text-cognito-400 px-3 py-1 rounded-full">Auto-generated</span>
          </div>
          <div class="p-6" id="decision-log-content">
            <div class="border border-gray-800 rounded-xl p-5 mb-4">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 bg-cognito-500/20 rounded-lg flex items-center justify-center">
                    <i class="fas fa-code-branch text-cognito-400 text-sm"></i>
                  </div>
                  <div>
                    <h4 class="text-white font-semibold text-sm">Auth middleware strategy selection</h4>
                    <span class="text-xs text-gray-500">2026-02-09 10:30 UTC</span>
                  </div>
                </div>
                <span class="text-xs bg-green-500/10 text-green-400 px-3 py-1 rounded-full font-medium">High Confidence</span>
              </div>
              <div class="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Decision</p>
                  <p class="text-sm text-gray-300">Strategy pattern over middleware chain</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Rationale</p>
                  <p class="text-sm text-gray-300">Allows runtime selection, easier to test in isolation</p>
                </div>
              </div>
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Alternatives Rejected</p>
                <div class="flex flex-wrap gap-2">
                  <div class="bg-surface-900 rounded-lg px-3 py-2 text-sm">
                    <span class="text-red-400 font-medium">Middleware chain</span>
                    <span class="text-gray-500 ml-2">&mdash; Order-dependent, harder to test</span>
                  </div>
                  <div class="bg-surface-900 rounded-lg px-3 py-2 text-sm">
                    <span class="text-red-400 font-medium">Passport.js</span>
                    <span class="text-gray-500 ml-2">&mdash; Heavy dependency, most features unused</span>
                  </div>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-2">
                <span class="text-xs text-gray-500">Reversible:</span>
                <span class="text-xs text-green-400">Yes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== EXPERIMENTATION MODE ===== -->
    <section id="experiments" class="py-24 px-4 sm:px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Experimentation Mode</h2>
          <p class="text-gray-400 max-w-xl mx-auto">Compare implementation variants side-by-side with identical tests and clear metric deltas. Never silently replace your baseline.</p>
        </div>
        <div class="glass rounded-2xl overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between">
            <span class="text-sm font-mono text-gray-400">experiment &middot; Auth Middleware Comparison</span>
            <span class="text-xs bg-green-500/10 text-green-400 px-3 py-1 rounded-full">Completed</span>
          </div>
          <div class="grid md:grid-cols-2 divide-x divide-gray-800/50">
            <!-- Variant A -->
            <div class="p-6">
              <div class="flex items-center gap-2 mb-4">
                <span class="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono">A</span>
                <span class="text-white font-semibold text-sm">Baseline (JWT only)</span>
              </div>
              <p class="text-xs text-gray-500 mb-4">Current production JWT middleware</p>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">Avg Latency</span>
                  <span class="text-sm font-mono text-white">12ms</span>
                </div>
                <div class="w-full bg-surface-900 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" style="width: 24%"></div></div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">P99 Latency</span>
                  <span class="text-sm font-mono text-white">45ms</span>
                </div>
                <div class="w-full bg-surface-900 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" style="width: 45%"></div></div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">Memory</span>
                  <span class="text-sm font-mono text-white">2.1 MB</span>
                </div>
                <div class="w-full bg-surface-900 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" style="width: 42%"></div></div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">Tests</span>
                  <span class="text-sm font-mono text-green-400">47/47</span>
                </div>
              </div>
            </div>
            <!-- Variant B -->
            <div class="p-6">
              <div class="flex items-center gap-2 mb-4">
                <span class="text-xs bg-cognito-500/20 text-cognito-400 px-2 py-0.5 rounded font-mono">B</span>
                <span class="text-white font-semibold text-sm">Proposed (Strategy pattern)</span>
              </div>
              <p class="text-xs text-gray-500 mb-4">New dual-auth with strategy resolver</p>
              <div class="space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">Avg Latency</span>
                  <span class="text-sm font-mono text-white">14ms <span class="text-yellow-400 text-xs">+2ms</span></span>
                </div>
                <div class="w-full bg-surface-900 rounded-full h-2"><div class="bg-cognito-500 h-2 rounded-full" style="width: 28%"></div></div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">P99 Latency</span>
                  <span class="text-sm font-mono text-white">48ms <span class="text-yellow-400 text-xs">+3ms</span></span>
                </div>
                <div class="w-full bg-surface-900 rounded-full h-2"><div class="bg-cognito-500 h-2 rounded-full" style="width: 48%"></div></div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">Memory</span>
                  <span class="text-sm font-mono text-white">2.3 MB <span class="text-yellow-400 text-xs">+0.2MB</span></span>
                </div>
                <div class="w-full bg-surface-900 rounded-full h-2"><div class="bg-cognito-500 h-2 rounded-full" style="width: 46%"></div></div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-gray-400">Tests</span>
                  <span class="text-sm font-mono text-green-400">52/52 <span class="text-cognito-400 text-xs">+5 new</span></span>
                </div>
              </div>
            </div>
          </div>
          <!-- Verdict -->
          <div class="px-6 py-4 border-t border-gray-800/50 bg-surface-900/30">
            <div class="flex items-start gap-3">
              <i class="fas fa-check-circle text-cognito-400 mt-0.5"></i>
              <div>
                <p class="text-sm text-white font-medium">Verdict: Acceptable regression</p>
                <p class="text-xs text-gray-400 mt-1">+2ms avg latency is within budget. +0.2MB memory is negligible. 5 new tests improve coverage from 87% to 93%. Recommend merging Variant B.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== REPO CONTRACTS ===== -->
    <section id="contracts" class="py-24 px-4 sm:px-6">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Repo Contract Enforcement</h2>
          <p class="text-gray-400 max-w-xl mx-auto">Define your project's rules. CogNito validates all output against them. Violations are flagged before code is written.</p>
        </div>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="glass rounded-xl p-6 hover:border-cognito-500/30 transition">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                <i class="fas fa-bug text-red-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">Error Handling</h4>
                <span class="text-xs text-green-400">Enforced</span>
              </div>
            </div>
            <ul class="space-y-2">
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> Use Result&lt;T, E&gt; pattern, never throw</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> All errors must have error codes</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> Log at boundary, not at source</li>
            </ul>
          </div>
          <div class="glass rounded-xl p-6 hover:border-cognito-500/30 transition">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <i class="fas fa-vial text-blue-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">Test Conventions</h4>
                <span class="text-xs text-green-400">Enforced</span>
              </div>
            </div>
            <ul class="space-y-2">
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> No mocks - use real implementations</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> Test behavior, not implementation</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> Minimum 80% branch coverage</li>
            </ul>
          </div>
          <div class="glass rounded-xl p-6 hover:border-cognito-500/30 transition">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <i class="fas fa-ban text-yellow-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">Forbidden Patterns</h4>
                <span class="text-xs text-green-400">Enforced</span>
              </div>
            </div>
            <ul class="space-y-2">
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-times text-red-400 mt-1 text-xs"></i> No <code class="text-red-300">any</code> types</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-times text-red-400 mt-1 text-xs"></i> No <code class="text-red-300">console.log</code> in production</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-times text-red-400 mt-1 text-xs"></i> No synchronous file I/O</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-times text-red-400 mt-1 text-xs"></i> No default exports in library code</li>
            </ul>
          </div>
          <div class="glass rounded-xl p-6 hover:border-cognito-500/30 transition">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <i class="fas fa-sitemap text-purple-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">Architecture</h4>
                <span class="text-xs text-green-400">Enforced</span>
              </div>
            </div>
            <ul class="space-y-2">
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> Dependency injection only</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> No circular imports</li>
              <li class="text-sm text-gray-400 flex items-start gap-2"><i class="fas fa-check text-cognito-500 mt-1 text-xs"></i> Maximum 3 levels of nesting</li>
            </ul>
          </div>
        </div>
        <!-- Contract Config -->
        <div class="mt-10 code-block rounded-2xl overflow-hidden">
          <div class="px-5 py-3 border-b border-gray-800/50">
            <span class="text-xs text-gray-500 font-mono">.cognito/contract.yaml</span>
          </div>
          <pre class="p-5 text-sm font-mono leading-relaxed overflow-x-auto"><code><span class="yaml-key">contract</span>:
  <span class="yaml-key">error_handling</span>:
    <span class="yaml-key">pattern</span>: <span class="yaml-string">"result"</span>  <span class="yaml-comment"># result | throw | either</span>
    <span class="yaml-key">require_error_codes</span>: <span class="yaml-value">true</span>
    <span class="yaml-key">log_at</span>: <span class="yaml-string">"boundary"</span>

  <span class="yaml-key">testing</span>:
    <span class="yaml-key">allow_mocks</span>: <span class="yaml-value">false</span>
    <span class="yaml-key">min_branch_coverage</span>: <span class="yaml-value">80</span>
    <span class="yaml-key">test_style</span>: <span class="yaml-string">"behavioral"</span>

  <span class="yaml-key">forbidden</span>:
    <span class="yaml-key">types</span>: <span class="yaml-value">["any"]</span>
    <span class="yaml-key">apis</span>: <span class="yaml-value">["console.log", "fs.readFileSync"]</span>
    <span class="yaml-key">patterns</span>: <span class="yaml-value">["default export"]</span>

  <span class="yaml-key">architecture</span>:
    <span class="yaml-key">di_only</span>: <span class="yaml-value">true</span>
    <span class="yaml-key">max_nesting</span>: <span class="yaml-value">3</span>
    <span class="yaml-key">no_circular_imports</span>: <span class="yaml-value">true</span></code></pre>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== AGENTS ===== -->
    <section class="py-24 px-4 sm:px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Built-in Agents</h2>
          <p class="text-gray-400 max-w-xl mx-auto">Switch between agents with <kbd class="glass px-2 py-0.5 rounded text-xs text-cognito-400 font-mono">Tab</kbd>. Each has a distinct role and permission set.</p>
        </div>
        <div class="grid md:grid-cols-3 gap-6">
          <div class="glass rounded-2xl p-6 border-cognito-500/30">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-cognito-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-hammer text-cognito-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">build</h4>
                <span class="text-xs text-cognito-400">Default</span>
              </div>
            </div>
            <p class="text-gray-400 text-sm mb-3">Full-access agent for development work. Creates work notes, enforces contracts, tracks decisions.</p>
            <div class="flex flex-wrap gap-1.5">
              <span class="text-xs bg-cognito-500/10 text-cognito-300 px-2 py-0.5 rounded">file write</span>
              <span class="text-xs bg-cognito-500/10 text-cognito-300 px-2 py-0.5 rounded">shell exec</span>
              <span class="text-xs bg-cognito-500/10 text-cognito-300 px-2 py-0.5 rounded">web access</span>
            </div>
          </div>
          <div class="glass rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-search text-blue-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">plan</h4>
                <span class="text-xs text-blue-400">Read-only</span>
              </div>
            </div>
            <p class="text-gray-400 text-sm mb-3">Analysis and exploration agent. Generates plans and work notes without modifying code. Perfect for reviewing unfamiliar codebases.</p>
            <div class="flex flex-wrap gap-1.5">
              <span class="text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded">file read</span>
              <span class="text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded">analyze</span>
              <span class="text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded">plan only</span>
            </div>
          </div>
          <div class="glass rounded-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <i class="fas fa-robot text-purple-400"></i>
              </div>
              <div>
                <h4 class="text-white font-semibold">general</h4>
                <span class="text-xs text-purple-400">Subagent</span>
              </div>
            </div>
            <p class="text-gray-400 text-sm mb-3">Complex search and multistep task subagent. Invoked with <code class="text-purple-300 font-mono text-xs">@general</code> in messages for deep research tasks.</p>
            <div class="flex flex-wrap gap-1.5">
              <span class="text-xs bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded">multi-step</span>
              <span class="text-xs bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded">search</span>
              <span class="text-xs bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded">delegate</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== COMPARISON TABLE ===== -->
    <section class="py-24 px-4 sm:px-6">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">How CogNito Compares</h2>
          <p class="text-gray-400 max-w-xl mx-auto">CogNito inherits the best from the AI coding agent ecosystem and adds a decision-awareness layer that no other tool provides.</p>
        </div>
        <div class="glass rounded-2xl overflow-hidden overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-800/50">
                <th class="text-left p-4 text-gray-400 font-normal">Feature</th>
                <th class="p-4 text-center text-cognito-400 font-semibold">CogNito</th>
                <th class="p-4 text-center text-gray-400 font-normal">Claude Code</th>
                <th class="p-4 text-center text-gray-400 font-normal">Copilot</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Open source</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Provider-agnostic</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Structured work notes</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Scope enforcement</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Experimentation mode</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Repo contracts</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Decision logging</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Partial acceptance</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-yellow-400"><i class="fas fa-minus"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
              </tr>
              <tr class="border-b border-gray-800/30">
                <td class="p-4 text-gray-300">Built-in LSP</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-red-400"><i class="fas fa-times"></i></td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
              </tr>
              <tr>
                <td class="p-4 text-gray-300">TUI + Desktop + Web</td>
                <td class="p-4 text-center text-cognito-400"><i class="fas fa-check"></i></td>
                <td class="p-4 text-center text-yellow-400">TUI only</td>
                <td class="p-4 text-center text-yellow-400">IDE only</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== INSTALLATION ===== -->
    <section id="install" class="py-24 px-4 sm:px-6">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Installation</h2>
          <p class="text-gray-400 max-w-xl mx-auto">Get CogNito running in seconds. Use any package manager or our one-line install script.</p>
        </div>

        <div class="code-block rounded-2xl overflow-hidden mb-8">
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-800/50">
            <span class="text-xs text-gray-500 font-mono">Quick Install</span>
            <button onclick="copyToClipboard('curl -fsSL https://cognito.dev/install | bash')" class="text-xs text-gray-400 hover:text-cognito-400 transition flex items-center gap-1">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>
          <pre class="p-5 text-sm font-mono"><code class="text-cognito-400">curl -fsSL https://cognito.dev/install | bash</code></pre>
        </div>

        <div class="code-block rounded-2xl overflow-hidden mb-8">
          <div class="px-5 py-3 border-b border-gray-800/50">
            <span class="text-xs text-gray-500 font-mono">Package Managers</span>
          </div>
          <pre class="p-5 text-sm font-mono leading-loose overflow-x-auto"><code><span class="yaml-comment"># npm / bun / pnpm / yarn</span>
<span class="text-cognito-400">npm i -g cognito-ai@latest</span>

<span class="yaml-comment"># macOS and Linux (Homebrew)</span>
<span class="text-cognito-400">brew install cognito-ai/tap/cognito</span>

<span class="yaml-comment"># Windows</span>
<span class="text-cognito-400">scoop install cognito</span>
<span class="text-cognito-400">choco install cognito</span>

<span class="yaml-comment"># Arch Linux</span>
<span class="text-cognito-400">paru -S cognito-bin</span>

<span class="yaml-comment"># Nix</span>
<span class="text-cognito-400">nix run nixpkgs#cognito</span>

<span class="yaml-comment"># Any OS via mise</span>
<span class="text-cognito-400">mise use -g cognito</span></code></pre>
        </div>

        <div class="glass rounded-2xl p-6">
          <h4 class="text-white font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-desktop text-cognito-400"></i> Desktop App (Beta)
          </h4>
          <p class="text-gray-400 text-sm mb-4">CogNito is also available as a native desktop app. Download from releases or use Homebrew:</p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-800/50">
                  <th class="text-left py-2 text-gray-500 font-normal">Platform</th>
                  <th class="text-left py-2 text-gray-500 font-normal">Download</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-800/30">
                  <td class="py-2 text-gray-300">macOS (Apple Silicon)</td>
                  <td class="py-2 font-mono text-xs text-cognito-400">cognito-desktop-darwin-aarch64.dmg</td>
                </tr>
                <tr class="border-b border-gray-800/30">
                  <td class="py-2 text-gray-300">macOS (Intel)</td>
                  <td class="py-2 font-mono text-xs text-cognito-400">cognito-desktop-darwin-x64.dmg</td>
                </tr>
                <tr class="border-b border-gray-800/30">
                  <td class="py-2 text-gray-300">Windows</td>
                  <td class="py-2 font-mono text-xs text-cognito-400">cognito-desktop-windows-x64.exe</td>
                </tr>
                <tr>
                  <td class="py-2 text-gray-300">Linux</td>
                  <td class="py-2 font-mono text-xs text-cognito-400">.deb, .rpm, or AppImage</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-4">
            <pre class="text-sm font-mono text-gray-400"><code><span class="yaml-comment"># macOS (Homebrew)</span>
brew install --cask cognito-desktop
<span class="yaml-comment"># Windows (Scoop)</span>
scoop bucket add extras; scoop install extras/cognito-desktop</code></pre>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== CONTRIBUTING ===== -->
    <section id="contributing" class="py-24 px-4 sm:px-6">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Contributing</h2>
          <p class="text-gray-400 max-w-xl mx-auto">CogNito is open source under the MIT license. We welcome contributions from the community.</p>
        </div>
        <div class="grid md:grid-cols-2 gap-6 mb-10">
          <div class="glass rounded-xl p-6">
            <h4 class="text-white font-semibold mb-3">Accepted Contributions</h4>
            <ul class="space-y-2 text-sm text-gray-400">
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Bug fixes</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Additional LSPs / Formatters</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Improvements to LLM performance</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Support for new providers</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Environment-specific quirk fixes</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Documentation improvements</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> New contract rule types</li>
              <li class="flex items-center gap-2"><i class="fas fa-check text-cognito-500 text-xs"></i> Work notes enhancements</li>
            </ul>
          </div>
          <div class="glass rounded-xl p-6">
            <h4 class="text-white font-semibold mb-3">Getting Started</h4>
            <div class="code-block rounded-lg p-4 text-sm font-mono mb-4">
              <div class="text-gray-500 mb-1"># Clone and install</div>
              <div class="text-cognito-400">git clone https://github.com/AnomalyCo/cognito</div>
              <div class="text-cognito-400">cd cognito</div>
              <div class="text-cognito-400">bun install</div>
              <div class="text-cognito-400">bun dev</div>
            </div>
            <p class="text-xs text-gray-500">Requires: Bun 1.3+</p>
            <div class="mt-4 space-y-2 text-sm text-gray-400">
              <p><strong class="text-gray-300">Style:</strong> Keep functions focused. Avoid <code class="text-red-300">try/catch</code>. Prefer <code class="text-cognito-300">const</code>. No <code class="text-red-300">any</code> types.</p>
              <p><strong class="text-gray-300">Testing:</strong> Avoid mocks. Test real implementations.</p>
              <p><strong class="text-gray-300">PRs:</strong> Must reference an existing issue. Keep them small.</p>
            </div>
          </div>
        </div>
        <div class="glass rounded-xl p-6">
          <h4 class="text-white font-semibold mb-3">PR Title Convention</h4>
          <div class="flex flex-wrap gap-2">
            <span class="text-xs bg-cognito-500/10 text-cognito-300 px-3 py-1.5 rounded-lg font-mono">feat: new feature</span>
            <span class="text-xs bg-blue-500/10 text-blue-300 px-3 py-1.5 rounded-lg font-mono">fix: bug fix</span>
            <span class="text-xs bg-yellow-500/10 text-yellow-300 px-3 py-1.5 rounded-lg font-mono">docs: documentation</span>
            <span class="text-xs bg-purple-500/10 text-purple-300 px-3 py-1.5 rounded-lg font-mono">chore: maintenance</span>
            <span class="text-xs bg-orange-500/10 text-orange-300 px-3 py-1.5 rounded-lg font-mono">refactor: code refactor</span>
            <span class="text-xs bg-red-500/10 text-red-300 px-3 py-1.5 rounded-lg font-mono">test: add/update tests</span>
          </div>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== SECURITY ===== -->
    <section class="py-24 px-4 sm:px-6">
      <div class="max-w-4xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Security</h2>
          <p class="text-gray-400 max-w-xl mx-auto">CogNito runs locally on your machine. Understand the threat model.</p>
        </div>
        <div class="glass rounded-2xl p-6 mb-6">
          <h4 class="text-white font-semibold mb-3">Threat Model</h4>
          <p class="text-sm text-gray-400 mb-4">CogNito is an AI-powered coding assistant that runs locally. It provides an agent system with access to shell execution, file operations, and web access.</p>
          <div class="space-y-3">
            <div class="flex items-start gap-3">
              <i class="fas fa-exclamation-triangle text-yellow-400 mt-1"></i>
              <div>
                <p class="text-sm text-white font-medium">No Sandbox</p>
                <p class="text-xs text-gray-400">The permission system is a UX feature, not a security boundary. For true isolation, run CogNito inside Docker or a VM.</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <i class="fas fa-server text-blue-400 mt-1"></i>
              <div>
                <p class="text-sm text-white font-medium">Server Mode</p>
                <p class="text-xs text-gray-400">Opt-in only. Set <code class="text-cognito-300">COGNITO_SERVER_PASSWORD</code> for HTTP Basic Auth. Without it, the server runs unauthenticated.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="glass rounded-xl p-6">
          <h4 class="text-white font-semibold mb-3">Reporting Vulnerabilities</h4>
          <p class="text-sm text-gray-400">Use the GitHub Security Advisory <a href="#" class="text-cognito-400 underline">"Report a Vulnerability"</a> tab. We'll respond within 6 business days.</p>
        </div>
      </div>
    </section>

    <div class="section-divider"></div>

    <!-- ===== FOOTER ===== -->
    <footer class="py-16 px-4 sm:px-6">
      <div class="max-w-7xl mx-auto">
        <div class="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-cognito-500 rounded-lg flex items-center justify-center font-mono font-bold text-surface-950 text-sm">C</div>
            <span class="font-bold text-lg tracking-tight">Cog<span class="text-cognito-400">Nito</span></span>
          </div>
          <div class="flex items-center gap-6">
            <a href="https://github.com/AnomalyCo/cognito" target="_blank" class="text-gray-400 hover:text-white transition text-sm flex items-center gap-2">
              <i class="fab fa-github"></i> GitHub
            </a>
            <a href="https://discord.gg/cognito" target="_blank" class="text-gray-400 hover:text-white transition text-sm flex items-center gap-2">
              <i class="fab fa-discord"></i> Discord
            </a>
            <a href="https://x.com/cognito_dev" target="_blank" class="text-gray-400 hover:text-white transition text-sm flex items-center gap-2">
              <i class="fab fa-x-twitter"></i> X.com
            </a>
          </div>
        </div>
        <div class="section-divider mb-6"></div>
        <div class="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>MIT License &copy; 2025-2026 CogNito Contributors</p>
          <p>A collaborator, not an autopilot.</p>
        </div>
      </div>
    </footer>
  </main>

  <script>
    // Navigation
    function navigate(id) {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Work Notes view toggle
    function showWorkNotesView(view) {
      const yamlEl = document.getElementById('work-notes-yaml');
      const visualEl = document.getElementById('work-notes-visual');
      const btnYaml = document.getElementById('btn-yaml');
      const btnVisual = document.getElementById('btn-visual');

      if (view === 'yaml') {
        yamlEl.classList.remove('hidden');
        visualEl.classList.add('hidden');
        btnYaml.className = 'text-xs px-3 py-1 rounded-md tab-active';
        btnVisual.className = 'text-xs px-3 py-1 rounded-md text-gray-400 hover:text-white border border-transparent';
      } else {
        yamlEl.classList.add('hidden');
        visualEl.classList.remove('hidden');
        btnVisual.className = 'text-xs px-3 py-1 rounded-md tab-active';
        btnYaml.className = 'text-xs px-3 py-1 rounded-md text-gray-400 hover:text-white border border-transparent';
      }
    }

    // Copy to clipboard
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        // Brief visual feedback would go here
      });
    }

    // Intersection observer for fade-in animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('section').forEach(section => {
      observer.observe(section);
    });
  </script>
</body>
</html>`
}

export default app
