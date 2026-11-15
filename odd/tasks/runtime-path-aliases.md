# Neutral runtime installation paths

Objective: Hide the active core runtime installation prefix from outgoing context while preserving executable paths and final response text.
Branch: readme
Trigger: risk item 2 (tool argument translation must not bypass permission inspection)
Scope in: Core installation root aliases in outgoing textual context; inverse translation in file tools, bash commands, and final assistant text.
Scope out: `.pi`, `gentle-pi`, generic removal of Pi mentions, opaque forced-prompt overrides, streaming concealment, new permissions or permission bypasses.
Rollback: Revert this feature's commits only, preserving unrelated files.
Success: Named scenarios show RED then GREEN; independent verification confirms round trips and previous behavior.

## Specs

### S1 — Neutral outgoing installation paths [behavior]

> "la verdad lo quiero es evitar en lo posible cualquier referencia a pi al modelo"
> "crea commit de los cambios y luego si comencemos con las rutas propias de pi. ya eliminamos la referencia de hacia los docs propios de pi. pero aun son necesarias otras rutas propias de pi por instrucciones que se usan. luego con el dir .pi y gentle-pi haremos lo mismo,"

- Outgoing textual context MUST replace the active core package root and descendant path prefixes with a neutral alias, preserving unrelated roots, structural identifiers, tool schemas, input objects and existing prompt filtering.
- The implementation MUST NOT alter `.pi` or `gentle-pi` roots in this phase.
- **S1.1** Given core installation paths in system sections, conversation text, tool-result text and historical call arguments, when projecting a request, then the exact installation prefix is replaced consistently, unrelated values and original objects remain unchanged, and similar but distinct prefixes are preserved.

### S2 — Restore execution paths including bash [behavior]

> "si hagamos la prueba de incluirlos"

- Neutral aliases MUST be restored to original paths in read/grep/find/ls path arguments and bash commands before execution. This MUST NOT grant permissions, suppress guards, execute commands itself, or silently widen writable tool support.
- **S2.1** Given aliased file-tool paths and bash commands with quoted paths including spaces, when the tool_call handler runs, then their original strings are restored exactly, unrelated arguments remain unchanged, and mocked hook execution performs no file or shell operation.

### S3 — Restore final response text [behavior]

> "la extension puede leer la respuesta del agente como un intermediario, quiero que podamos reemplazar strings al enviarlas y cuando retorne volver a poner las strings originales"

- Final assistant text MUST restore recognized aliases without changing tool-call arguments, non-text blocks, or incoming objects. Streaming is outside the guarantee.
- **S3.1** Given a finalized assistant response containing aliased paths, when message_end runs, then text paths are restored and other blocks and original input remain unchanged.

## Expected files

- T1: `pi-extension/index.ts`, `pi-extension/path-aliases.ts`, `pi-extension/index.test.mjs`, `pi-extension/path-aliases.test.mjs`, `pi-extension/README.md`, `README.md`

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S3 | gentle-ai-worker | in_progress | base 96023018bb27523d7a633c023b4b791a042e9d6c; RED checkpoint pending |
| T2 | S1-S3 | gentle-ai-verify | pending | independent snapshot/gate verification |

## Log

- **L1** original request: "crea commit de los cambios y luego si comencemos con las rutas propias de pi. ya eliminamos la referencia de hacia los docs propios de pi. pero aun son necesarias otras rutas propias de pi por instrucciones que se usan. luego con el dir .pi y gentle-pi haremos lo mismo,"
- **L2** bash inclusion accepted: "si hagamos la prueba de incluirlos"
- **D1 — Root discovery.** Choice: getPackageDir() from the active host, lazy enough to preserve Node tests without a locally installed runtime dependency. Alternatives: fixed user installation path or import resolution from extension directory. Rationale: installed API exports active runtime root and supports alternate installations.
- **D2 — Reversible alias.** Choice: neutral unambiguous prefix, literal simultaneous replacement, narrow field translation. Alternatives: delete substrings or rename all occurrences of pi. Rationale: preserve executable instructions without corrupting identifiers; document collisions/quoting limits rather than claim secrecy or sandboxing.
- **D3 — Scope and validation.** Functional requirements use behavior evidence; existing preamble/docs/rules tests remain green. Tests must not execute commands against the real installation. Unknown permission-hook ordering must be reported; never claim the alias is an access control.
