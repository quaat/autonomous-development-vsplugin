# Security & trust boundaries

This extension observes an autonomous workflow that edits source code and runs
commands. It is built to **preserve the reference workflow's safety boundaries**
and to add no new attack surface of its own.

## Inherited workflow boundaries (never weakened)

The extension never initiates and never enables any of the following — they
remain the responsibility (and the constraints) of the external workflow:

- Codex planning and review remain **read-only**.
- Never push, merge, publish, or deploy.
- Never rotate or expose credentials.
- Never apply irreversible production migrations.
- Never delete unrelated changes.
- Never weaken checks to obtain a passing result. The completion gate is computed
  from raw facts (raw severe-finding counts, real verdicts); triage dispositions
  never silence a gate.

## Workspace trust

Observer features (discovery, dashboard, artifact viewing, diffs) work in
untrusted workspaces. **Mutating controller actions** — evaluate, accept-drift,
cancel, archive, and guided setup — are disabled in untrusted workspaces, with
defense in depth:

- **Declarative:** menu/command `when` clauses require `autonomousDev.trusted`.
- **Runtime:** the controller service re-checks `vscode.workspace.isTrusted`
  before spawning any mutating subcommand.

The manifest declares `untrustedWorkspaces: limited` and `virtualWorkspaces:
limited` accordingly.

## Controller execution

- Commands are built as an **argument array** and spawned with `execFile` —
  **never** an interpolated shell string — so run ids and paths cannot inject
  shell syntax.
- Every run-scoped command carries an **explicit `--project-root` and
  `--run-id`**. There is no "single active run" fallback that could target an
  ambiguous run.
- Process execution is bounded by a timeout and a maximum output buffer.
- Error messages are surfaced without exposing secrets.

## Webview hardening

- A strict **Content-Security-Policy** with a per-load **nonce**:
  `default-src 'none'`; scripts only via the nonce; styles/fonts/images only from
  the webview's `cspSource`; no network origins.
- `localResourceRoots` is restricted to `dist/webview`.
- The webview receives only a **serialized view model** — never raw credentials,
  environment variables, or controller handles.
- All dynamic content is written with `textContent` / `createTextNode`; the
  webview never uses `innerHTML`, so artifact text cannot inject markup.

## Sensitive-data handling

- **Credential-bearing remote URLs are redacted** before they reach the output
  channel (`scheme://<redacted>@host`).
- The extension **does not log complete prompts by default**; prompts and review
  bodies may contain source code or secrets, so they are opened in editors on
  demand rather than echoed to the output channel.
- No Claude or Codex credentials are read, stored, embedded, or required. The
  test suite runs with no real model access.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainers rather than
opening a public issue, and allow time for a fix before disclosure.
