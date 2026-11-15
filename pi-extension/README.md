# Customize Pi's structured system prompt

Load the extension from the repository root:

```sh
pi -e ./pi-extension/index.ts
```

The extension projects three changes onto each outgoing request through `context_with_system`:

- Replace existing `preamble` sections with the `replacement` constant in `index.ts`. Its default is `You are a coding assistant. Help users inspect files, run commands, and modify code.`
- Replace existing `docs` sections with `docsReplacement`, an empty string by default. Set this constant to custom section text if needed.
- Remove the exact sentence `You can inspect PI_* environment variables for current model and session details.` from string-valued `rules` sections. A standalone sentence or `- ` bullet is removed with its line ending; embedded occurrences are removed without changing surrounding text. Matching is case-sensitive.

Edit the constants and restart Pi, or reload the extension where supported, to apply configuration changes. This removes a prompt guideline, not the environment variables themselves or access to them.

All existing system sections are processed, including later patches and deletion patches. Missing `preamble` and `docs` sections are not created. Other sections, tool declarations, message content, and conversation messages are preserved. A custom `SYSTEM.md` may have no structured sections; opaque prompt text is not rewritten.

This is a per-request projection, not a rewrite of the persisted session transcript. An extension that forces a complete prompt via `before_agent_start` projects that opaque prompt after `context_with_system`, so these changes cannot be guaranteed for that prompt. Later-loaded extensions can also change the request after this extension runs. An empty `docs` patch can still produce an empty section-update notice on providers that serialize intermediate system patches.

Run the deterministic tests with Node 22.19 or newer:

```sh
node --test pi-extension/index.test.mjs
```

Tests cover initial and patch messages, empty/null/missing sections, exact guideline removal, preservation of unrelated content and tools, idempotence, and input immutability. They exercise the registered event handler; they do not make live provider requests.
