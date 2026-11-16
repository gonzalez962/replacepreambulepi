# Installable Pi package manifest

Objective: Make the repository discoverable as a Pi package without a distribution branch.
Branch: feat/pi-package-manifest
Trigger: risk item 5 (installation metadata)
Scope in: Root package.json declaring the existing extension and host peer dependency.
Scope out: Extension behavior changes, dependency installation, lockfiles, publishing and PR creation.
Rollback: Remove only the new manifest.
Success: JSON parses; extension target exists; no runtime dependencies or lifecycle scripts; independent structural check passes.

## Specs

### S1 — Root package manifest [behavior]

> "listo aplica entonces en una rama nueva para agregar el package.json"

- The root manifest MUST declare name replacepreambulepi, version 0.1.0, keyword pi-package, pi.extensions containing only ./pi-extension/index.ts, and peerDependencies @earendil-works/pi-coding-agent with range *.
- No install scripts, runtime dependencies or extension behavior changes are in scope.
- **S1.1** Given the repository, when reading the root package.json, then it parses with the agreed declarations and its extension entry exists.

## Expected files

- T1: `package.json`, `pi-extension/package-manifest.test.mjs`

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1 | gentle-ai-worker | done | RED 8f11e03 (ENOENT exit1); GREEN 15/15 exit0; implementation 9024810 |
| T2 | S1 | gentle-ai-verify | done | independent 15/15 exit0; exact manifest/target assertion exit0; gate S1.1 COMPLIANT exit0 |

## Log

- **E2** Independent verification found no blockers: exact manifest and target-file assertion exit0, 15/15 tests exit0, no source/lockfile changes. Gate job-8 exit0 S1.1 COMPLIANT; scope, RED-only, skip markers, regression and config lock checks pass. Structural installation metadata only; no pi install or actual runtime loading performed. Module warnings remain disclosed.
- **E1** Worker observed RED before manifest (exit1 ENOENT), then GREEN 15/15 exit0. Node emits MODULE_TYPELESS_PACKAGE_JSON warnings; no type field added to avoid changing existing module contracts. Native assess blocked by unrelated untracked file and returned independent verification for item5. No installation performed.
- **L1** User request: "listo aplica entonces en una rama nueva para agregar el package.json"
- **D1** Choice: exact previously proposed manifest, host library only as peerDependency. No scripts or dependencies. Rationale: installed Pi packages documentation supports explicit pi.extensions and host-provided peers.
- **D2** Base: local main 23da2cd already contains merged PR #9; existing extension proof gaps are not resolved by packaging. Untracked .gitignore is unrelated and must remain untouched.
