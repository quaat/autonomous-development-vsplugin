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
- **Safe controller actions** (start run, evaluate gates, accept drift, cancel,
  archive) that run via argument arrays (never a shell), confirm before mutating,
  and are disabled in untrusted workspaces.
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

> **The one rule that matters:** runs are scoped to the open folder's **git
> identity**. The extension only lists runs that belong to the repository you have
> open. Always open in VS Code the _exact same folder_ the controller ran in — this
> is the usual reason a run "doesn't show up."

## Start a new project, end to end

**1. Make the project a git repository with at least one commit.** The run's
identity (and its folder under the state home) is derived from the git common-dir
and first commit, so a non-git folder produces no discoverable run.

```bash
mkdir my-project && cd my-project
git init && git commit --allow-empty -m "Initial commit"
```

**2. Start the autonomous run from inside that folder.** Either let the Claude
plugin drive the full loop:

```bash
cd my-project
claude --plugin-dir /path/to/autonomous-development
# then invoke the /autonomous-development:autonomous-feature skill and describe the feature
```

…or bootstrap a run directly with the controller (creates the run state the
extension will display):

```bash
cd my-project
python3 /path/to/autonomous-development/scripts/controller.py \
  init --feature "Describe the feature here" --mode auto
```

…or, once the folder is open in VS Code, run **Start Run** from the Active Runs
view title (the `+` button) or the command palette. It prompts for a feature
description, then opens an integrated terminal in the repository, launches
`claude --plugin-dir …`, and pre-fills the
`/autonomous-development:autonomous-feature` skill command — you review it and
press **Enter** to start the run (trusted workspaces only). This launches the
Claude driver itself, so there is no separate `controller.py init` step and no
orphan run; the skill stamps `run-state.json` under
`<state-home>/repositories/<repo-id>/runs/<run-id>/` as it begins.

**3. Open the same folder in VS Code** (File → Open Folder → `my-project`). It must
be the repository the controller ran in — not a parent or subfolder.

**4. Follow progress.** The **Active / Completed / Archived** views populate, and
**Open Workflow Dashboard** shows the live phase, verification results, Codex review
rounds and findings, acceptance-criteria status, adversarial-review requirement,
completion gates, and recommended next action. The view refreshes as the controller
writes state; **Refresh Runs** forces a reload.

### If the view stays empty

| Symptom                                                            | Likely cause                                                   | Fix                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "No runs found **for this workspace**"                             | A different folder is open than where the run was created      | Open the exact repository the controller ran in                                                      |
| Empty even with the right folder                                   | The run isn't in the _Active_ group                            | Check the Completed / Archived views (and the `loadCompletedRuns` / `loadArchivedRuns` settings)     |
| No runs anywhere                                                   | State home mismatch                                            | Align `autonomousDev.stateHome` with the controller's state home (or `CLAUDE_AUTONOMOUS_STATE_HOME`) |
| Controller "not found" when driven from a sandboxed Claude session | The sandbox denies reading the plugin / writing the state home | Allow reads of the plugin dir and reads+writes of the state home in your Claude sandbox settings     |

## Key settings

`autonomousDev.controllerPath`, `autonomousDev.stateHome`,
`autonomousDev.pythonPath`, `autonomousDev.autoRefresh`,
`autonomousDev.notificationLevel`, `autonomousDev.maxEventLogEntries`,
`autonomousDev.loadCompletedRuns`, `autonomousDev.loadArchivedRuns`.

See the repository for architecture, protocol, and security documentation.

## License

MIT.
