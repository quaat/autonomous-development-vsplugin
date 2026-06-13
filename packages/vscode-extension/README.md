# SemanticMatter Autonomous Development

A read-only observer and visual control plane for the
[`quaat/autonomous-development`](https://github.com/quaat/autonomous-development)
autonomous feature-development workflow.

Discover workflow runs, inspect their progress and artifacts, compare prompt and
specification revisions in the native diff editor, review verification and Codex
review results, and invoke safe controller actions — without leaving VS Code, and
even when a run was started outside it.

## Features

- **Active / Completed / Archived** run views in a dedicated activity-bar
  container, each run showing status, phase, verification pass/fail, review round
  vs. budget, latest verdict, adversarial-review requirement, and unresolved
  completion gates.
- A **workflow dashboard** per run: stage timeline, current status, the
  original-idea → enhanced → accepted spec → proposed → accepted plan chain,
  verification commands and results, Codex review rounds and findings, and the
  recommended next action — all derived from one shared workflow model.
- Open any artifact in a normal editor; **compare** original↔accepted spec and
  proposed↔accepted plan in the **native diff editor**; click a finding to jump to
  its source line.
- **Safe controller actions** (evaluate gates, accept drift, cancel, archive) that
  target an explicit run id, run via argument arrays (never a shell), confirm
  before mutating, and are disabled in untrusted workspaces.
- Live, debounced refresh on state changes; malformed artifacts produce a
  diagnostic instead of crashing the view.

## Getting started

1. Open the **Autonomous Development** activity-bar view.
2. Runs are discovered from the resolved state home — the
   `autonomousDev.stateHome` setting, else `CLAUDE_AUTONOMOUS_STATE_HOME`, else the
   platform default. The legacy `<repo>/.ai/autonomous-development/` layout is
   detected read-only.
3. Select a run to open its dashboard.

Observer features need no controller and no Claude/Codex credentials. To enable
controller actions, run **Set Up Controller** and point it at your
`quaat/autonomous-development` `scripts/controller.py`.

## Key settings

`autonomousDev.controllerPath`, `autonomousDev.stateHome`,
`autonomousDev.pythonPath`, `autonomousDev.autoRefresh`,
`autonomousDev.notificationLevel`, `autonomousDev.maxEventLogEntries`,
`autonomousDev.loadCompletedRuns`, `autonomousDev.loadArchivedRuns`.

See the repository for architecture, protocol, and security documentation.

## License

MIT.
