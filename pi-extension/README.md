# Customize Pi's structured system prompt

## Installation

With Pi installed, install this repository as a Git package:

```sh
pi install git:github.com/gonzalez962/replacepreambulepi
```

No manual clone or separate npm installation is needed. The default branch must contain the root `package.json`; its `pi.extensions` manifest loads only `pi-extension/index.ts`. Pi supplies the host library, and the other repository components and tests are not loaded as extensions.

The command installs for your personal configuration. To declare the package only for the current project, use:

```sh
pi install --local git:github.com/gonzalez962/replacepreambulepi
```

Project packages load only after project trust is granted. Restart Pi or use `/reload` after installation. Review the extension source before loading it: extensions run with the permissions of the Pi process.

## Local development

To try a checked-out copy for one invocation, run from the repository root:

```sh
pi -e ./pi-extension/index.ts
```

Avoid loading the local copy alongside an already enabled Git installation.

## Behavior

The extension projects three changes onto each outgoing request through `context_with_system`, but only when the request model ID contains `gemini` (case-insensitive):

- Replace existing `preamble` sections with the `replacement` constant in `index.ts`. Its default is `You are a coding assistant. Help users inspect files, run commands, and modify code.`
- Replace existing `docs` sections with `docsReplacement`, an empty string by default. Set this constant to custom section text if needed.
- Remove the exact sentence `You can inspect PI_* environment variables for current model and session details.` from string-valued `rules` sections. A standalone sentence or `- ` bullet is removed with its line ending; embedded occurrences are removed without changing surrounding text. Matching is case-sensitive.

Edit the constants and restart Pi, or reload the extension where supported, to apply configuration changes. This removes a prompt guideline, not the environment variables themselves or access to them.

All existing system sections are processed, including later patches and deletion patches. Missing `preamble` and `docs` sections are not created. For requests whose model ID contains `gemini` (case-insensitive), outgoing text, system sections and historical tool-call argument strings also project the active core installation prefix to `/__runtime_root__`; tool schemas and structural identifiers are preserved. A missing or non-matching model ID leaves sections, paths and text untouched; provider identity is not used. The `.pi` and `gentle-pi` roots are not targeted. A literal occurrence of the reserved alias can collide with a projected path. A custom `SYSTEM.md` may have no structured sections; opaque forced prompts can bypass projection.

When the outgoing request enabled aliases, `message_end` restores assistant text and model-issued `read`, `grep`, `find`, `ls` path arguments and `bash` command strings before host validation and `tool_call` permission inspection, even if the selected model has since changed. `write` and `edit` are not supported; nested tool-issued calls are not translated. Bash replacement is literal, not shell parsing: callers must use appropriate shell quoting for the restored path, including spaces and shell metacharacters. Translation does not grant permissions, enforce guards, or provide security. Later extensions may change messages or tool inputs, and streaming output may expose aliases before finalization.

This is a per-request projection, not a rewrite of the persisted session transcript. An extension that forces a complete prompt via `before_agent_start` projects that opaque prompt after `context_with_system`, so these changes cannot be guaranteed for that prompt. Later-loaded extensions can also change the request after this extension runs. An empty `docs` patch can still produce an empty section-update notice on providers that serialize intermediate system patches.

Run the deterministic tests with Node 22.19 or newer:

```sh
node --test pi-extension/index.test.mjs pi-extension/path-aliases.test.mjs
```

Tests cover initial and patch messages, empty/null/missing sections, exact guideline removal, preservation of unrelated content and tools, idempotence, and input immutability. They exercise the registered event handler; they do not make live provider requests.
