# Contributing

Thanks for your interest in improving SemanticMatter Autonomous Development.

## Setup

```bash
npm install        # installs all workspaces
npm run build      # tsc -b libs, then esbuild the extension
```

Open the repo in VS Code and run the **Run Extension** launch configuration (or
`F5`) to try changes in an Extension Development Host.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md). The cardinal rule:

> **`packages/protocol` and `packages/core` must never import `vscode`.**

Node built-ins are fine; the VS Code API belongs only to
`packages/vscode-extension`. Workflow semantics (gates, next action, stage
derivation) live **once** in `@semanticmatter/core` and are consumed by every UI
surface — do not reimplement them in the extension, the webview, or a command.

## Quality gates

All of these must pass before a change is merged (CI runs them on Linux, macOS,
and Windows):

```bash
npm run typecheck        # strict TS (host + webview), no unused locals
npm run lint             # eslint
npm run format:check     # prettier
npm test                 # protocol + core unit tests
npm run test:integration # VS Code integration tests
npm run package          # the .vsix must build
```

Standards:

- **TypeScript strict mode**; treat unused symbols as errors.
- **Exact dependency versions** (no `^`/`~`) so builds are reproducible.
- Prefer small, plain TypeScript over new frameworks; justify any added
  dependency.
- Keep comments about _why_, not _what_.

## Tests

- Put pure logic in `core`/`protocol` and cover it with Mocha + `node:assert`
  unit tests (`packages/*/test/*.spec.ts`).
- Cover extension behavior with integration tests
  (`packages/vscode-extension/test/*.spec.ts`) driven by the programmatic
  fixtures in `test/fixtures.ts`. Tests must not require real Claude or Codex
  access or network beyond downloading VS Code.
- When you fix a parsing or derivation bug, add a fixture/spec that would have
  caught it.

## Adding a new event type

1. Add it to `KNOWN_EVENT_TYPES` in `packages/protocol/src/events.ts`.
2. Mirror it in `resources/schemas/run-event.schema.json` and document it in
   [PROTOCOL.md](PROTOCOL.md).
3. Map it to a timeline summary in `packages/protocol/src/timeline.ts`.
4. Remember: adding a type is **not** a breaking change — readers tolerate
   unknown types — so do not bump `RUN_EVENT_SCHEMA_VERSION` for additive work.

## Compatibility

When behavior against `quaat/autonomous-development` is uncertain, **preserve the
existing behavior and record the uncertainty** (in code comments and
[docs/REFERENCE.md](docs/REFERENCE.md)) rather than inventing a new
interpretation.

## Commits & PRs

- Keep PRs focused; describe the _why_.
- Ensure the quality gates above pass locally.
- Do not commit secrets or real credentials.
