# Supported / Deferred Matrix — kind-drift fixture

Minimal docs fixture for the kind-drift scenario. The drift under test is in sdk.ts,
schema.json and the extension manifest, not in this matrix.

| ID | Surface | Status | Evidence |
|---|---|---|---|
| S-001 | slot contributions | **supported** | TEST:slot |
| S-002 | dialog contributions | **supported** | TEST:dialog |
| S-003 | panel contributions | **supported** | TEST:panel |
| D-001 | bogusKind contributions (SDK only, absent from schema) | **deferred** | none |
