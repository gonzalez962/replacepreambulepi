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

- Neutral aliases MUST be restored to original paths in model-issued read/grep/find/ls path arguments and bash commands at message_end, before tool argument validation and tool_call permission inspection. This MUST NOT grant permissions, suppress guards, execute commands itself, or silently widen writable tool support.
- **S2.1** Given aliased file-tool paths and bash commands with quoted paths including spaces, when message_end finalizes model-issued calls, then their original strings are restored exactly before permission inspection, unrelated arguments remain unchanged, and hook execution performs no file or shell operation.

### S3 — Restore final response text [behavior]

> "la extension puede leer la respuesta del agente como un intermediario, quiero que podamos reemplazar strings al enviarlas y cuando retorne volver a poner las strings originales"

- Final assistant text MUST restore recognized aliases without changing non-target blocks or incoming objects; only S2's supported tool-call argument fields may also change. Streaming is outside the guarantee.
- **S3.1** Given a finalized assistant response containing aliased paths, when message_end runs, then text paths and S2's supported tool arguments are restored, while other blocks and original input remain unchanged.

## Expected files

- T1: `pi-extension/index.ts`, `pi-extension/path-aliases.ts`, `pi-extension/index.test.mjs`, `pi-extension/path-aliases.test.mjs`, `pi-extension/README.md`, `README.md`

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S3 | gentle-ai-worker | in_progress | base 96023018bb27523d7a633c023b4b791a042e9d6c; RED checkpoint 521c61838aa3f696fbad2017b7983315c9996d3c; implementation running |
| T2 | S1-S3 | gentle-ai-verify | pending | independent snapshot/gate verification |

## Log

- **L1** original request: "crea commit de los cambios y luego si comencemos con las rutas propias de pi. ya eliminamos la referencia de hacia los docs propios de pi. pero aun son necesarias otras rutas propias de pi por instrucciones que se usan. luego con el dir .pi y gentle-pi haremos lo mismo,"
- **L2** bash inclusion accepted: "si hagamos la prueba de incluirlos"
- **E1 — RED checkpoint.** Worker observed three existing tests passing (exit 0), and S1.1/S2.1/S3.1 failing with AssertionError (exit 1, stderr empty). Parent reviewed tests and committed tests-only checkpoint 521c61838aa3f696fbad2017b7983315c9996d3c before authorizing source implementation.
- **D1 — Root discovery.** Choice: getPackageDir() from the active host, lazy enough to preserve Node tests without a locally installed runtime dependency. Alternatives: fixed user installation path or import resolution from extension directory. Rationale: installed API exports active runtime root and supports alternate installations.
- **D2 — Reversible alias.** Choice: neutral unambiguous prefix, literal simultaneous replacement, narrow field translation. Alternatives: delete substrings or rename all occurrences of pi. Rationale: preserve executable instructions without corrupting identifiers; document collisions/quoting limits rather than claim secrecy or sandboxing.
- **D4 — Pre-permission restoration.** Choice: restore supported assistant tool-call fields at message_end, not tool_call. Installed agent loop awaits message_end before extracting calls and validating arguments, and session applies same-role replacements in place. This resolves the discovered earlier-guard bypass without changing product scope. Later extensions can still mutate inputs; nested tool-issued calls are not covered. Revised S2/S3 architectural assertions require a new tests-only checkpoint before implementation.
- **D3 — Scope and validation.** Functional requirements use behavior evidence; existing preamble/docs/rules tests remain green. Tests must not execute commands against the real installation. Unknown permission-hook ordering must be reported; never claim the alias is an access control.
