# System instruction replacements

Native Linux amd64 plugin. It applies ordered, case-sensitive literal rules during the host's `request.normalize` hook. It changes system/developer instruction text, not user or tool messages. This hook is **not** a final outbound scrubber: subsequent translation or provider logic may introduce or modify text.

Registration metadata identifies the current source repository as `https://github.com/router-for-me/CLIProxyAPI`. Replace this identifier if the plugin is extracted into a separate repository.

## Offline normalization tests

`opencode_test.go` exercises `request.normalize` through the same dispatcher as the
native ABI. The Chat Completions and Responses fixtures in `testdata/opencode/`
are synthetic OpenCode-shaped requests, not captured production traffic. Their
prompts, model names, tool arguments, and URLs are placeholders.

Each fixture contains an input request and its expected result. Tests cover empty
rules, ordered replacements, repeated matches, case sensitivity, and deletion.
They compare the complete decoded request, so user and assistant messages, tool
definitions/calls/results, metadata, and other fields must remain unchanged.
Normalization must also leave the persisted rules unchanged.

This repository has no standalone Go module. From its root, use a separate
CLIProxyAPI checkout that supplies `sdk/pluginabi` and the pinned dependencies.
The following POSIX shell example uses CLIProxyAPI **v8.0.73**
(`43806c865da7d47f9252316e95e315ad9f885b84`), which requires Go **1.26.10+**:

```sh
host=$(mktemp -d)
git clone --depth 1 --branch v8.0.73 \
  https://github.com/router-for-me/CLIProxyAPI.git "$host"
cp -R cpamc-plugin "$host/replacesystemprompt"
cd "$host"
git rev-parse HEAD # 43806c865da7d47f9252316e95e315ad9f885b84

go test -mod=readonly -count=1 -v ./replacesystemprompt \
  -run '^TestOpenCodeNormalizationFixtures$'
go test -mod=readonly -count=1 ./replacesystemprompt
```

On PowerShell, create an empty temporary host directory and use `Copy-Item
-Recurse cpamc-plugin "$host/replacesystemprompt"` instead of `cp -R`; the Go
commands are the same. With CGO enabled, Go also needs a C compiler.

Initial setup downloads public source dependencies. The tests themselves make no
provider requests and need no API keys. They check normalization behavior, not
whether prompt content causes or resolves `429 RESOURCE_EXHAUSTED`; they make no
claims about account enforcement. Do not replace the fixtures with private prompt
dumps. Remove the temporary host checkout when finished.

## Build with Docker

From the repository root, using Docker Desktop and the official Go image (a Linux amd64 C compiler is required):

Git Bash:

```sh
MSYS_NO_PATHCONV=1 docker run --rm --platform linux/amd64 -v "$(pwd -W):/src" -w /src -e CGO_ENABLED=1 -e GOOS=linux -e GOARCH=amd64 golang:1.26 go build -buildmode=c-shared -o /src/replacesystemprompt/replacesystemprompt-linux-amd64.so ./replacesystemprompt
```

PowerShell:

```powershell
docker run --rm --platform linux/amd64 -v "${PWD}:/src" -w /src -e CGO_ENABLED=1 -e GOOS=linux -e GOARCH=amd64 golang:1.26 go build -buildmode=c-shared -o /src/replacesystemprompt/replacesystemprompt-linux-amd64.so ./replacesystemprompt
```

Copy `replacesystemprompt/replacesystemprompt-linux-amd64.so` to the server's configured `plugins.dir` without renaming it. The installed filename determines the plugin ID used by the configuration and resource URL. Enable plugins in the server config:

```yaml
plugins:
  enabled: true
  dir: plugins
  configs:
    replacesystemprompt-linux-amd64:
      enabled: true
```

At registration the plugin automatically creates `replacesystemprompt-rules.json`, if absent, with private file permissions. It selects the first existing directory in this order: `plugins` under the server working directory, `/CLIProxyAPI/plugins`, then the server working directory. The selected directory must be writable by the server user; a failure does not fall back elsewhere. No path configuration is required. This policy does not discover arbitrary installed plugin locations. Protect the directory because rules may contain sensitive instruction text. Existing rules are preserved; successful edits persist before activation. Do not edit the file externally while the plugin is running.

Open `/v0/resource/plugins/replacesystemprompt-linux-amd64/form` on the server. If the installed filename differs, replace `replacesystemprompt-linux-amd64` in the configuration and resource URL with its filename without `.so`. Sign in to CPAMC with “Remember password” enabled; the form reuses the existing session and sends its credential as an authorization header to `/v0/management/plugins/replacesystemprompt/rules`. No separate credential is stored by the form. Use HTTPS or a trusted local connection. Add a match and replacement, or leave replacement empty to delete matching text. Match strings must be unique; adding a duplicate is rejected, and a persisted file containing duplicate matches is invalid. Remove buttons delete rules. The public form contains no persisted rule data; management routes rely on the host's management authentication. No additional listener is opened.

Changes take effect immediately and survive a plugin reload. Roll back by disabling/removing the plugin; the JSON file is retained.
