# System prompt utilities

Utilities for inspecting and replacing system instructions at different integration points: a Pi extension, a local capture server, and a native CLIProxyAPI plugin. These are separate components, not tools registered for an AI model to call.

All commands below run from this repository's root unless noted otherwise.

## Choose a component

| Component | Purpose | Entry point |
| --- | --- | --- |
| [Pi extension](pi-extension/README.md) | Customize the preamble, suppress Pi docs, and remove the PI environment guideline for Gemini models in outgoing requests. | `pi-extension/index.ts` |
| [System prompt capture server](capture-system-prompt/README.md) | Capture instructions from API requests locally without forwarding them to a model. | `capture-system-prompt/server.cjs` |
| [CLIProxyAPI plugin](cpamc-plugin/README.md) | Apply configurable literal replacements to system/developer instructions during request normalization. | `cpamc-plugin/main.go` |

## Pi extension

Install the extension through Pi's Git package support (no local clone required):

```sh
pi install git:github.com/gonzalez962/replacepreambulepi
```

This command uses the repository's default branch and requires its root `package.json` manifest. The manifest declares only `pi-extension/index.ts`: the capture server, native plugin and tests are not loaded as extensions. Pi supplies the host library.

For a project-local installation instead of a personal installation:

```sh
pi install --local git:github.com/gonzalez962/replacepreambulepi
```

For local development, load the checked-out extension from the repository root:

```sh
pi -e ./pi-extension/index.ts
```

The extension listens to `context_with_system` and replaces existing `sections.preamble` values in system messages. Its current replacement text is defined by the `replacement` constant in `pi-extension/index.ts`:

```text
You are a coding assistant. Help users inspect files, run commands, and modify code.
```

The `docsReplacement` constant defaults to `""`, suppressing existing `sections.docs` content; set it to custom section text if needed. The extension also removes the exact sentence `You can inspect PI_* environment variables for current model and session details.` from `sections.rules`, including its standalone bullet line. This does not remove environment variables or restrict access to them.

The preamble, docs and rules filters apply only when the request model ID contains `gemini` (case-insensitive). Every other model, including Anthropic models served through claude-bridge, keeps its original system sections unchanged; rewriting them there breaks claude-bridge's prompt-capture match.

For requests whose model ID contains `gemini` (case-insensitive), it also projects the active core installation path to a neutral alias in outgoing text and historical tool arguments, then restores final assistant text and supported model-issued read/grep/find/ls paths and bash commands before permission inspection. A missing or non-matching model ID disables path translation; provider identity is not used. Restoration follows the outgoing request's activation even if the selected model changes. Tool declarations remain unchanged; `.pi` and `gentle-pi` are not targeted. Bash substitution is literal and requires appropriate shell quoting. Aliases are not a security boundary, streaming is not concealed, and later extensions can change messages or inputs. It does not create missing preamble/docs sections; a full prompt imposed through `before_agent_start` can bypass projection.

See [the extension README](pi-extension/README.md) for configuration, patch behavior, and integration limits.

## System prompt capture server

Requires **Node.js 22+**, with no additional packages.

```sh
node capture-system-prompt/server.cjs
# Optional custom port:
node capture-system-prompt/server.cjs --port 9000
```

The server listens on `127.0.0.1` (default port `8787`) and extracts instructions from requests compatible with OpenAI Chat Completions, OpenAI Responses, and Claude Messages.

Each accepted capture is saved as JSON under `capture-system-prompt/captures/`. The server then returns **HTTP 403** intentionally: it does not perform inference or forward requests upstream. Client retries can therefore create duplicate captures. CORS is not enabled.

**Sensitive data:** capture files can contain confidential instructions. Protect them and delete them when no longer needed.

See [the capture server README](capture-system-prompt/README.md) for request and response details.

## CLIProxyAPI plugin

A native **Linux amd64** plugin that applies ordered, case-sensitive, literal replacements during `request.normalize`. It targets system/developer instructions, not user or tool messages, and is not a final outbound-request filter.

### Build and configure

This component requires a compatible CLIProxyAPI/MoeForge host module, its dependencies, CGO, and a Linux amd64 C compiler. This repository does not include a standalone Go module for building the plugin directly.

1. Integrate the plugin sources into the compatible host build environment.
2. Follow [the plugin build instructions](cpamc-plugin/README.md), adapting their `./replacesystemprompt` source path to where you placed `cpamc-plugin/`.
3. Copy the compiled `.so` into the host's `plugins.dir` and enable it.
4. Open `/v0/resource/plugins/<name-without-so>/form` to manage replacement rules. CPAMC requires a session with **Remember password** enabled.

Rules are persisted in `replacesystemprompt-rules.json`. The selected directory must be writable; do not edit this file externally while the plugin is running. Rules can contain sensitive text, so protect the file and use HTTPS or a trusted local connection for administration.

## Tests

| Component | Command from repository root | Requirements / caveats |
| --- | --- | --- |
| Capture server | `node --test capture-system-prompt/server.test.cjs` | Node.js 22+. |
| Plugin configuration form | `node --test cpamc-plugin/form.test.cjs` | Node.js test runner. This does not test the native plugin. |
| Pi extension | `node --test pi-extension/index.test.mjs pi-extension/path-aliases.test.mjs` | Node.js 22.19+. Covers preamble/docs replacement, guideline removal, and preservation of unrelated transcript data. |

Native plugin tests are in `cpamc-plugin/plugin_test.go`; running them requires the compatible host module and dependencies described above.
