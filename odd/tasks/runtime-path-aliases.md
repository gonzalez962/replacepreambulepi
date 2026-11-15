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

### S4 — Gemini-only route adjustment [behavior]

> "si aplica eso y dime como quedarian las rutas que se envian al modelo segun el request de ejemplo que tenemos"

- Path projection MUST activate only when the request model ID contains `gemini`, case-insensitively; absent or other IDs MUST leave paths unchanged. Existing preamble/docs/environment guideline filters MUST remain active for all models.
- Restoration MUST follow whether the outgoing request enabled aliases, not a later selected model.
- **S4.1** Given Gemini, mixed-case Gemini, non-Gemini or missing model context, when projecting and finalizing a response, then only Gemini requests translate paths, restoration follows the request even if model selection changes, and non-path filters remain active.

## Expected files

- T1: `pi-extension/index.ts`, `pi-extension/path-aliases.ts`, `pi-extension/index.test.mjs`, `pi-extension/path-aliases.test.mjs`, `pi-extension/README.md`, `README.md`
- T3: `pi-extension/index.ts`, `pi-extension/index.test.mjs`, `pi-extension/path-aliases.test.mjs`, `pi-extension/README.md`, `README.md`

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S3 | gentle-ai-worker | done | implementation 3e31d8a; correction 1503d3b; independent 8/8 exit 0 |
| T2 | S1-S3 | gentle-ai-verify | blocked | S1/S3 defect recheck passed; S2 installed-runtime integration proof unavailable; needs human disposition |
| T3 | S4 | gentle-ai-worker | in_progress | Gemini conditional activation; tests-only checkpoint pending |
| T4 | S4 | gentle-ai-verify | pending | scoped independent verification only, no retry of missing S2 integration |

## Log

- **L1** original request: "crea commit de los cambios y luego si comencemos con las rutas propias de pi. ya eliminamos la referencia de hacia los docs propios de pi. pero aun son necesarias otras rutas propias de pi por instrucciones que se usan. luego con el dir .pi y gentle-pi haremos lo mismo,"
- **L3** Gemini-only adjustment accepted: "si aplica eso y dime como quedarian las rutas que se envian al modelo segun el request de ejemplo que tenemos". Accepted proposal: ctx.model.id case-insensitive includes gemini, path-only gating, response restoration tied to request activation. This does not waive prior S2 missing integration proof.
- **L2** bash inclusion accepted: "si hagamos la prueba de incluirlos"
- **E1 — RED checkpoint.** Worker observed three existing tests passing (exit 0), and S1.1/S2.1/S3.1 failing with AssertionError (exit 1, stderr empty). Parent reviewed tests and committed tests-only checkpoint 521c61838aa3f696fbad2017b7983315c9996d3c before authorizing source implementation.
- **D1 — Root discovery.** Choice: getPackageDir() from the active host, lazy enough to preserve Node tests without a locally installed runtime dependency. Alternatives: fixed user installation path or import resolution from extension directory. Rationale: installed API exports active runtime root and supports alternate installations.
- **D2 — Reversible alias.** Choice: neutral unambiguous prefix, literal simultaneous replacement, narrow field translation. Alternatives: delete substrings or rename all occurrences of pi. Rationale: preserve executable instructions without corrupting identifiers; document collisions/quoting limits rather than claim secrecy or sandboxing.
- **E4 — Final bounded result.** Correction 1503d3b observed RED 7 pass/1 fail then GREEN 8/8. Independent single recheck on snapshot 211644ec-4ad9-43fa-acc0-ef099bd4652d passed 8/8 exit 0 and a synthetic probe verified period handling with distinct -other/.extension suffixes. No integration retry. Implementation exists but S2's actual runtime permission-ordering proof remains unavailable; feature is not verified ready for use. Needs human decision on obtaining that proof separately or reverting/defering execution translation. Earlier assess correction-range input mistakenly used a non-resolving placeholder base; its unassessable response is not committed-range evidence.
- **E3 — Independent verification.** 7/7 tests passed, but probe proved exact root or alias followed by sentence-ending period is not translated (S1/S3 defect). S2 runtime integration unavailable: only direct-handler tests and installed source ordering evidence, no end-to-end validation/permission harness. One correction batch authorized for punctuation, then one limited recheck; do not retry unavailable integration proof. Missing integration requires a bounded Needs your decision outcome rather than a safety guarantee.
- **E2 — Implementation.** Revised RED checkpoint 6c80aa88481104e7eb1701627d34e0d8aac104ff preceded implementation 3e31d8a. Parent observed 7/7 focused tests pass, exit 0 and git diff --check pass. Snapshot f2d74504-23f2-4ed8-a98b-a176657dc60f retained under OS temp. Native assess could not classify untracked files but returned independent verification for explicit risk item 2; no native lifecycle invoked.
- **D4 — Pre-permission restoration.** Choice: restore supported assistant tool-call fields at message_end, not tool_call. Installed agent loop awaits message_end before extracting calls and validating arguments, and session applies same-role replacements in place. This resolves the discovered earlier-guard bypass without changing product scope. Later extensions can still mutate inputs; nested tool-issued calls are not covered. Revised S2/S3 architectural assertions require a new tests-only checkpoint before implementation.
- **D3 — Scope and validation.** Functional requirements use behavior evidence; existing preamble/docs/rules tests remain green. Tests must not execute commands against the real installation. Unknown permission-hook ordering must be reported; never claim the alias is an access control.
