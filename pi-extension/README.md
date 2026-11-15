# Replace Pi's preamble

Load the extension from the repository root:

```sh
pi -e ./replacepreambulepi/pi-extension/index.ts
```

By default the named `preamble` section is replaced with an empty string. To use your own text, edit the `replacement` constant in `index.ts` and restart Pi or reload the extension where supported.

The extension changes only existing `preamble` sections in the request transcript, including later patches and deletion patches. It leaves other sections, tool declarations, message content and conversation messages unchanged. A custom `SYSTEM.md` may have no `preamble` section; the extension does not invent one or change opaque prompt text.

This is a per-request projection, not a rewrite of the persisted session transcript. An extension that forces a complete prompt via `before_agent_start` projects that opaque prompt after `context_with_system`, so replacing its preamble is not supported. Later-loaded extensions can also change the request after this extension runs.

Run the deterministic test with Node 22.19 or newer:

```sh
node --test replacepreambulepi/pi-extension/index.test.mjs
```
