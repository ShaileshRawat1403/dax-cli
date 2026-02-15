# RAO Modes Spec

## Purpose

Define two operating modes for RAO and an objective promotion gate from Mode A to Mode B.

- Mode A: observability-first
- Mode B: policy-evolution (human-in-the-loop)

This document sets measurable thresholds, hard safety invariants, deterministic requirements, and phased delivery criteria.

## Modes

### Mode A (Default)

Scope:

- replay and simulation (`/rao replay`, `/rao replay --simulate`)
- diff and analysis outputs
- no policy auto-application

Guarantee:

- RAO remains read-only with respect to PM policy unless explicit PM commands are used.

### Mode B (Opt-In)

Scope:

- generate policy suggestions from replay/simulate signals
- stage and apply suggestions one at a time with explicit operator action

Guarantee:

- no autonomous policy mutation
- full audit trail for every suggestion apply/reject

## Promotion Gate: Mode A -> Mode B

Promotion is allowed only when all sections below pass.

### 1) Suggestion Quality (rolling window)

Window:

- 30 days or last 500 events (whichever is smaller)

Thresholds:

- acceptance rate >= 35%
- revert rate (accepted suggestions) <= 5%
- false positive rate <= 20%
- median time-to-accept <= 2 minutes

Minimum sample size:

- at least 50 evaluated suggestions (accepted or rejected)

Hard block:

- any suggestion that broadens access to a `never_touch`-restricted target is invalid.

### 2) Safety and Policy Invariants

Required invariants:

- `never_touch` precedence is absolute.
- suggestions cannot modify `never_touch` except via explicit break-glass flow.
- suggestions may only target approved PM fields:
  - `constraints.always_allow.*`
  - `constraints.require_approval.*`
  - `preferences.risk`
  - `preferences.verbosity`

Boundedness constraints:

- no broad wildcard patterns (`*`) in suggestions
- no regex unless explicitly enabled
- no path patterns above repo root
- no inferred widening of patterns

### 3) Determinism and Reproducibility

Each suggestion must include provenance:

- source RAO event ids
- recorded vs simulated diff summary
- `policy_hash`
- `contract_hash`
- evaluator version

Determinism requirement:

- with identical inputs and current policy state, `/rao replay --simulate` must produce the same suggestion set (content and order).

### 4) Human-in-the-loop UX Contract

Required commands:

- `/rao suggest [n]`
- `/pm apply-suggestion <id>`
- `/pm apply-suggestion <id> --dry-run`
- `/rao reject-suggestion <id> [reason]`

Apply audit requirement:

- every apply writes PM event with:
  - `event_type: "rao_suggestion_apply"`
  - `before_json`
  - `after_json`
  - `suggestion_id`
  - `rao_event_ids`
  - `sim_diff`

Reject audit requirement:

- rejection reason is persisted for quality metrics.

### 5) Drift Guardrails

Throttles:

- max 3 applied suggestions per day (default)
- cooldown: same subject cannot be relaxed twice within 24 hours

Evidence gate:

- require at least 2 similar friction hits in recent history before suggesting relaxation, unless explicitly requested by user.

Confidence gate:

- only suggestions with confidence >= medium can be applied without extra confirmation.

## Implementation Shape

### Phase 4.1 (simulate and diff stability)

- keep Mode A behavior
- harden simulation/diff as deterministic inputs to later suggestioning

Storage:

- no new tables required
- reuse bounded PM state structures

### Phase 4.2 (suggestions, non-autonomous)

- add bounded suggestion list in PM state:
  - `pm_state.state_json.rao.suggestions[]`
- add apply/reject command surfaces
- maintain append-only audit for applies/rejects

## Definition of Done

### Phase 4.1 DoD

- `/rao replay --simulate` deterministic across repeated runs.
- `/rao diff` (or equivalent output) is stable and suggestion-ready.
- simulation path has zero side effects (no PM writes, no RAO writes).
- backcompat preserved for Phase 3 RAO events.
- tests cover:
  - simulation determinism
  - no-mutation invariant
  - missing-data graceful handling

### Phase 4.2 DoD

- `/rao suggest [n]` produces bounded suggestions with provenance.
- `/pm apply-suggestion <id>` applies exactly one suggestion and audits full before/after.
- `/pm apply-suggestion <id> --dry-run` emits exact diff with no mutation.
- `/rao reject-suggestion <id> [reason]` persists rejection metadata.
- suggestion guardrails enforced in code:
  - field allowlist
  - pattern boundedness
  - confidence threshold
  - daily cap and cooldown
- tests cover:
  - precedence and invariant preservation
  - deterministic suggestion ordering
  - apply/reject audit completeness

## Notes

- Mode B is an execution mode, not autonomy.
- Human approval is mandatory for any policy mutation.
- Promotion from A to B requires two consecutive passing windows against the gate metrics.
