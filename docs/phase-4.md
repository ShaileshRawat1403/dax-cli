# Phase 4 Design Note

## 0. Objective

Extend RAO from replayable history to replayable history with semantics:

- smaller storage footprint
- stronger interpretability across versions
- ability to re-evaluate past events against current policy without mutating state

Non-goals:

- no new tables unless compression forces it
- no breaking changes to existing `/rao replay`
- no auto-migration of legacy snapshots beyond minimal tagging

## 1. Snapshot Delta Compression

### Problem

RAO history stores repeated payloads that are mostly identical across adjacent events:

- repeated context fields
- repeated warnings with small variations
- repeated run metadata

This increases:

- `pm_state` bloat
- context pack costs when RAO signals are included
- long-term durability risk (row size, backups, sync)

### Proposed Model

Introduce a `RaoEvent` format:

```ts
type RaoEvent = {
  id: string
  ts: string
  kind: "run" | "audit" | "override"
  base?: string
  delta: RaoDelta
  meta: {
    schema: "rao.v2"
    policy_hash?: string
    contract_hash?: string
    pm_rev?: string
  }
}
```

`delta` is a sparse patch, not a full snapshot.

### Delta Format Choice

Use JSON Patch (RFC 6902):

```ts
type RaoDelta = {
  op: "add" | "remove" | "replace"
  path: string
  value?: unknown
}[]
```

Rationale:

- standard and well-understood
- explicit delete semantics
- composable and deterministic with sorted operations

### Reconstruction Rule

To render a snapshot:

- start from empty baseline for the first event
- apply deltas sequentially until target id
- cache every `N` events as checkpoint snapshots

### Checkpoint Policy

- every 10 events store `checkpoint: true` with full snapshot
- non-checkpoint events store deltas against previous event

### Determinism Requirements

- canonical key ordering
- stable patch generation order (sorted by `path`, then `op`)
- identical input state produces identical delta output

### Acceptance Criteria

- RAO history footprint reduced by >50% in typical usage
- `/rao replay` output remains identical to Phase 3 for equivalent streams
- no drift from patch ordering

## 2. Policy/Version Tagging

### Problem

Replay without policy and contract provenance is incomplete.

### Minimum Viable Tagging

Attach to each RAO event:

- `meta.schema` (event schema version)
- `meta.policy_hash` (policy inputs hash)
- `meta.contract_hash` (loaded contract hash)
- `meta.pm_rev` (PM revision at append time)

### Hash Definitions

- `policy_hash`: stable JSON of policy-relevant config, SHA-256
- `contract_hash`: SHA-256 of contract file bytes
- `pm_rev`: incrementing PM revision, updated on PM mutations (not RAO append)

### Creation Point

Tags are created in agent append path, not derived in CLI.

### Backward Compatibility

If tags are missing:

- display `unknown`
- simulation stays available with warning when enough data exists

## 3. Replay Simulation Semantics (`/rao replay --simulate`)

### Goal

Re-evaluate historical events against current policy as a pure analysis path.

### Definitions

- replay: recorded facts
- simulate: what current policy would decide for historical inputs

### Output Shape

Per event:

- recorded blocked/warnings
- simulated blocked/warnings
- diff: added warnings, removed warnings, blocked state flip

### Scope Rules

- never execute tools
- never mutate PM state
- never append RAO
- pure function evaluation only

### Required Inputs

- historical tool calls or extracted targets
- current PM constraints
- current contract
- current gate evaluator

### Missing Data Handling

If event lacks simulation inputs:

- mark as `simulate: unavailable`
- include reason (missing tool calls, missing targets, missing metadata)

### Determinism

Simulation result must be deterministic for the same:

- event payload
- current policy/PM/contract
- evaluator version

### Safety Stance

Simulation never widens capability. It reports only.

## 4. CLI UX Design (Minimal)

Keep existing commands stable.

Add:

- `/rao replay --simulate [n]`
- `/rao show <id> --simulate`

Optional alias:

- `/rao diff <id>`

JSON mode:

- includes `recorded` and `simulated` blocks
- uses existing redaction rules

## 5. Storage Constraints and Limits

Move from snapshot count cap to event-based cap:

- `MAX_RAO_EVENTS = 200`
- checkpoint interval: 10
- hard-cap serialized RAO size in `pm_state`
- eviction policy: drop oldest events first

## 6. Testing Strategy

1. Delta reconstruction identity
- reconstructed state from deltas equals baseline snapshot stream

2. Deterministic delta generation
- same input yields identical patch ordering

3. Simulation correctness
- stable recorded/simulated diff
- no PM or RAO mutations during simulation

4. Backward compatibility
- Phase 3 history still replays
- simulation warns instead of crashing on missing fields

## 7. Decisions Locked

1. Delta format: JSON Patch (RFC 6902)
2. Checkpoint and cap defaults: interval 10, cap 200 events
3. Simulation purity: no side effects, no simulated append
