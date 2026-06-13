# Architecture

## Goals

- Keep all workflow semantics (state parsing, stage/gate/next-action derivation)
  **VS Code-free** so they are reusable and unit-testable in isolation.
- Derive every completion-gate and next-action judgement **exactly once** and have
  all UI surfaces consume that single model.
- Treat the external `quaat/autonomous-development` state as the source of truth;
  read it tolerantly and never rewrite it implicitly.

## Packages

```
@semanticmatter/protocol   packages/protocol
@semanticmatter/core       packages/core
semanticmatter-…extension  packages/vscode-extension
```

### `@semanticmatter/protocol`

The versioned `RunEvent` envelope, a dependency-free schema validator, a tolerant
JSONL reader (truncated final line, dedup, monotonic-sequence checks), and
timeline reconstruction. **No third-party runtime dependencies; never imports
`vscode`.** See [PROTOCOL.md](PROTOCOL.md).

### `@semanticmatter/core`

The compatibility + semantics layer. Depends only on `@semanticmatter/protocol`
and Node built-ins; **never imports `vscode`.** It owns:

- **State-home resolution** (`stateHome.ts`) — the setting → env → platform-default
  precedence, with all inputs injectable for the platform test matrix.
- **Run discovery** (`runDiscovery.ts`) — repositories/runs under a state home,
  grouped into active/completed/archived, plus legacy in-repo detection.
- **Tolerant parsing** (`runState.ts`) — normalizes `run-state.json`
  (schema_version 2, v1 tolerated) into camelCase domain types; a malformed file
  yields diagnostics, never a throw.
- **The shared workflow evaluator** (`workflow/`) — `evaluateWorkflow` is the one
  place gate logic (`gates.ts`) and next-action logic (`nextAction.ts`) live, plus
  verification (`verification.ts`), review (`reviews.ts`), and stage (`stages.ts`)
  summaries. It is pure; IO is assembled by `loadRun.ts`.
- **Controller argv construction** (`controller/args.ts`) — builds the controller
  command as an argument array (explicit `--project-root` and `--run-id`); spawning
  happens in the host.
- **Adapter contracts** (`adapters/`) — type-only interfaces for the future Claude
  Agent SDK and Codex app-server integrations. No implementations this release.

### `semanticmatter-autonomous-development` (the extension)

The only package that imports `vscode`. It is pure orchestration + presentation:
discovery caching, tree/dashboard/status-bar/notification rendering, file
watching, command handlers, and controller spawning. It contains **no** gate or
next-action logic of its own.

## Data flow

```
state home (disk)
   │  discoverRuns / detectLegacyRun        (core)
   ▼
DiscoveredRun[]  ──loadRun──►  RunState + WorkflowModel + diagnostics   (core)
   │
   ▼
RunStore  (extension: caches runs, owns "selected run", fires onDidChange)
   ├──► RunTreeProvider ×3      (Active / Completed / Archived views)
   ├──► DashboardPanel ──renderModel──► DashboardView ──postMessage──► webview
   ├──► RunStatusBar
   └──► RunNotifier             (diffs per-run snapshots across refreshes)

FileSystemWatcher ──debounced──► RunStore.refresh()  (when autoRefresh)
```

`renderModel.ts` (host-side, vscode-free) reshapes a `DiscoveredRun` + event log
into a serializable `DashboardView`. It reads per-round review files for finding
detail but takes every _judgement_ (stages, gates, next action, summaries)
straight from the core `WorkflowModel`.

## Webview isolation

The extension ships two esbuild bundles:

- **Host** (`dist/extension.js`) — CommonJS, Node platform, `vscode` external.
- **Webview** (`dist/webview/main.js`) — browser IIFE with no Node/VS Code access.

The two communicate only through a typed `WebviewMessage` union and a serialized
`DashboardView` (`viewTypes.ts`, which imports nothing). The webview HTML uses a
strict Content-Security-Policy with a per-load nonce, `localResourceRoots`
restricted to `dist/webview`, and never receives raw credentials. All dynamic
text is written via `textContent`, never `innerHTML`. See [SECURITY.md](SECURITY.md).

## Controller integration

Controller actions are constructed in core as an argv array and spawned in the
host via `execFile` — **never** a shell. Each run-scoped command requires an
explicit run id (no "single active run" fallback), and mutating subcommands are
gated on workspace trust both declaratively (`when: autonomousDev.trusted`) and at
runtime. The extension remains fully useful in observer mode with no controller
configured.

## Testing strategy

- **Unit** (`packages/{protocol,core}/test`) — parsing, the platform state-home
  matrix, gate/next-action derivation, verification "latest-effective", review
  parsing, event parsing/timeline, forward-compatibility, and controller argv.
- **Integration** (`packages/vscode-extension/test`) — activation, command
  registration, discovery/grouping, per-scenario model derivation, malformed
  tolerance, legacy detection, artifact opening, native diff, and open-at-line,
  all driven by programmatic fixtures (`test/fixtures.ts`) covering eleven run
  scenarios. No real Claude/Codex access.
