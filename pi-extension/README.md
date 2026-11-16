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

## Behavior

The extension projects three changes onto each outgoing request through `context_with_system`:

- Replace existing `preamble` sections with the `replacement` constant in `index.ts`. Its default is `You are a coding assistant. Help users inspect files, run commands, and modify code.`
- Replace existing `docs` sections with `docsReplacement`, an empty string by default. Set this constant to custom section text if needed.
- Remove the exact sentence `You can inspect PI_* environment variables for current model and session details.` from string-valued `rules` sections. A standalone sentence or `- ` bullet is removed with its line ending; embedded occurrences are removed without changing surrounding text. Matching is case-sensitive.

Edit the constants and restart Pi, or reload the extension where supported, to apply configuration changes. This removes a prompt guideline, not the environment variables themselves or access to them.

All existing system sections are processed, including later patches and deletion patches. Missing `preamble` and `docs` sections are not created. For requests whose model ID contains `gemini` (case-insensitive), preamble, docs, and rules are modified, and core installation paths are aliased to `/__runtime_root__`. For all other models, the original sections are preserved unchanged and no path aliasing occurs.

All existing system sections are processed, including later patches and deletion patches. Missing `preamble` and `docs` sections are not created. For requests whose model ID contains `gemini` (case-insensitive), outgoing text, system sections and historical tool-call argument strings also project the active core installation prefix to a neutral alias. For all other models, the original sections and paths are preserved unchanged.

All existing system sections are processed, including later patches and deletion patches. Missing `preamble` and `docs` sections are not created. For requests whose model ID contains `gemini` (case-insensitive), preamble, docs, and rules are modified, and core installation paths are aliased to `/__runtime_root__`. For all other models, the original sections and paths are preserved unchanged.

All existing system sections are processed, including later patches and deletion patches. Missing `preamble` and `docs` sections are not created. For requests whose model ID contains `gemini` (case-insensitive), preamble, docs, and rules are modified, and core installation paths are aliased to `/__runtime_root__`. For all other models, the original sections and paths are preserved unchanged.

Run the deterministic tests with Node 22.19 or newer:

```sh
node --test pi-extension/index.test.mjs pi-extension/path-aliases.test.mjs
```

Tests cover initial and patch messages, empty/null/missing sections, exact guideline removal, preservation of unrelated content and tools, idempotence, and input immutability. They exercise the registered event handler; they do not make live provider requests.