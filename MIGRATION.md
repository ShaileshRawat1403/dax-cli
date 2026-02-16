# Cognito to DAX Migration

## Summary

DAX is the new product/CLI name. Legacy Cognito names remain supported during v1.x for compatibility.

## Command Mapping

- `dax ...` is the primary command
- `cognito ...` remains a compatibility alias in v1.x

## Environment Variable Mapping

DAX variables are primary. Cognito variables are fallback only.

- `DAX_API_URL` <- `COGNITO_API_URL`
- `DAX_ORCHESTRATOR_ONLY` <- `COGNITO_ORCHESTRATOR_ONLY`
- `DAX_POLICY` <- `COGNITO_POLICY`
- `DAX_HISTORY_PATH` <- `COGNITO_HISTORY_PATH`
- `DAX_HISTORY_LIMIT` <- `COGNITO_HISTORY_LIMIT`
- `DAX_DB_PATH` <- `COGNITO_DB_PATH`
- `DAX_USER_ID` <- `COGNITO_USER_ID`

## Database Path

Current default remains `cognito.db` for v1.x compatibility.

If set, `DAX_DB_PATH` wins over `COGNITO_DB_PATH`.

## Contract Path Resolution

Contract loaders resolve in this order:

1. `.dax/contract.yaml`
2. `.cognito/contract.yaml`

## Deprecation Plan

### v1.x

- `dax` is primary
- `cognito` alias supported
- `COGNITO_*` fallback supported
- one-time warning shown when legacy env vars are used

### v2.0 (planned)

- remove `cognito` alias
- remove `COGNITO_*` fallback
- keep migration notes in release docs
