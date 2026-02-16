# Phase 4.1 Checklist

Scope: tagging and replay/simulate determinism only. No delta compression implementation in this phase.

- [ ] Add `RaoEvent` v2 schema types without breaking Phase 3 snapshot replay.
- [ ] Add event metadata tags on append:
  - [ ] `schema`
  - [ ] `policy_hash`
  - [ ] `contract_hash`
  - [ ] `pm_rev`
- [ ] Implement deterministic hash utilities (canonical JSON input, stable ordering).
- [ ] Keep simulation read-only boundary intact:
  - [ ] no `savePM`
  - [ ] no `appendRao`
  - [ ] no `createDecision`
  - [ ] no `createWorkNote`
  - [ ] no `pm_events` writes
- [ ] Preserve backward-compatible replay for Phase 3 snapshots.
- [ ] Add tests:
  - [ ] deterministic hash outputs for identical inputs
  - [ ] mixed Phase 3 + Phase 4 replay compatibility
  - [ ] simulate path remains side-effect free
