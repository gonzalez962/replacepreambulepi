# OpenCode plugin

Apply ordered, case-sensitive literal replacements to outgoing system instructions
in **OpenCode V2**. This is a native OpenCode server plugin: it does not require Pi,
CLIProxyAPI, CGO, or a Linux binary. It has no runtime imports or additional packages.

Unlike Pi's extension, it does **not** detect a structured preamble. OpenCode exposes
an array of text parts, not `sections.preamble`. Rules apply to every matching
substring in those parts; choose precise matches rather than broad words.

## Load and configure

Keep this directory in your local checkout and add it to your project's
`opencode.jsonc` using the directory's path relative to that configuration file.
For example, if the checkout is beside your project:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "../replacepreambulepi/opencode-plugin",
      "options": {
        "rules": [
          {
            "match": "Exact instruction fragment you want to replace.",
            "replacement": "Your replacement instruction."
          }
        ]
      }
    }
  ]
}
```

Merge the entry into your existing configuration; do not replace unrelated fields.
Use forward slashes in JSON paths, including on Windows. No shell commands or native
compilation are needed to load the plugin. Remove its configuration entry to disable
it. OpenCode watches plugin configuration; `/reload` forces a reload if needed.

Do not also copy it under `.opencode/plugins/`: those plugins load automatically,
which could apply rules twice if you register the same plugin separately.

### Rules

- `rules` is an array of `{ "match": string, "replacement": string }`, using the
  same shape as the CLIProxyAPI plugin.
- Missing or empty `rules` makes no changes. No default prompt is imposed.
- Each match must be nonempty and unique. Invalid rules fail plugin setup before
  a hook is registered. An empty replacement deletes the matched text.
- Rules execute in array order on each system part. Later rules see earlier
  replacements, including all repeated matches. Matching is case-sensitive.
- Both strings are literal: no regex, template expansion, or special `$&` behavior.
- Rules cannot match across two separate system parts.
- If a request matches no configured rule, it is unchanged and the plugin emits
  one generic warning via `console.warn`. Further no-match warnings are suppressed
  until reload. Neither prompts nor rule contents are logged by this plugin.

You must supply the actual fragment to change; the placeholder above is not an
OpenCode instruction. The optional capture server in this repository can help
inspect requests, but intentionally returns HTTP 403 and never forwards them.
Protect captures and configuration files: both can contain confidential instructions.

## Scope and limitations

The plugin registers only `ctx.session.hook("context", ...)`: the agent loop,
including continuations after tool calls. It does not alter title generation,
compaction, transient `generate` calls, persisted history, or configuration.

Only `event.system[i].text` is replaced. Other system-part properties (including
cache hints and metadata), messages, tool definitions, and generation options are
preserved. Original part objects are not modified. The experimental instruction
source metadata remains the original copy, not a record of the rewritten text.

All providers used by the configured location are affected. Earlier plugins' edits
are visible to this hook; later plugins or an upstream proxy can change the request
again. This is not a final outbound filter and cannot rewrite provider-internal
instructions. It does not bypass OpenCode's permission checks.

Changing instructions can remove useful guidance or change model behavior. Use a
narrow match, keep project and tool guidance intact, and recheck matches after
OpenCode updates. This utility makes no claims about quality improvements, token
savings, resolving `429 RESOURCE_EXHAUSTED`, or account enforcement.

## Compatibility and tests

Targets the [OpenCode V2 server plugin API](https://opencode.ai/docs/build/plugins/server/#model-requests)
and its [local directory loader](https://opencode.ai/docs/build/plugins).
Plugin shape and hook types were checked against `@opencode/plugin` **2.0.4** and
**2.3.0**. It is not an OpenCode V1 plugin.

Run from the repository root with **Node.js 22.19+** (native TypeScript stripping):

```sh
node --test opencode-plugin/server.test.mjs
```

The 7 offline tests import the actual entrypoint, invoke `setup` with a minimal host
double, and check literal replacement, ordering, preservation of emptied parts and
metadata, malformed entry handling, validation, warnings, and hook disposal. They run
without SDK installation, API keys, or provider calls. On Windows, offline tests were
run with Node.js 26.13.0, and SDK 2.0.4 `Host.resolve`/`Host.load` also resolved and
imported the directory cleanly.

Live runtime behavior was also smoke-tested on Windows with **OpenCode `v2.3.0`**
(`opencode run --standalone`) configured via `opencode.jsonc` against this repository's
[capture server](../capture-system-prompt/README.md) (`openai-compatible`, HTTP `403`).
That verified local plugin loading without a `package.json`, `ctx.options.rules`
delivery, ordered chained rewrites on `/v1/chat/completions`, untouched title
generation without spurious warnings, and single no-match warning emission.

Unverified scope: live upstream provider responses, live Anthropic/Gemini wire runs, a
standalone `tsc` typecheck, Linux, and macOS execution.
