import * as path from 'node:path';

import * as vscode from 'vscode';
import type { DiscoveredRun } from '@semanticmatter/core';

import type { ExtensionConfig } from '../config';
import { ControllerError, type ControllerService } from '../controller/controllerService';
import { isWorkspaceTrusted } from '../trust';

export interface ControllerCommandDeps {
  readonly service: ControllerService;
  readonly getConfig: () => ExtensionConfig;
  readonly refresh: () => void;
}

async function ensureConfigured(service: ControllerService): Promise<boolean> {
  if (service.isConfigured()) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    'No controller is configured. Controller actions are unavailable in observer-only mode.',
    'Set Up Controller'
  );
  if (choice === 'Set Up Controller') {
    await vscode.commands.executeCommand('autonomousDev.setupController');
  }
  return false;
}

function reportError(err: unknown): void {
  const message =
    err instanceof ControllerError ? err.message : err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(message);
}

async function runWithProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title },
    task
  );
}

/** POSIX single-quote a value so it is inert when typed into a shell. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Derive the installed plugin root from the configured controller path. The
 * controller always lives at `<plugin-root>/scripts/controller.py`, so the
 * plugin root is two directories up. Returns undefined when the path doesn't
 * match that shape (we then launch without `--plugin-dir` and rely on a
 * globally installed plugin).
 */
function pluginDirFromControllerPath(controllerPath: string): string | undefined {
  if (controllerPath.length === 0) {
    return undefined;
  }
  const scriptsDir = path.dirname(controllerPath);
  if (path.basename(scriptsDir) !== 'scripts') {
    return undefined;
  }
  return path.dirname(scriptsDir);
}

/**
 * Start a new autonomous-development run by launching the Claude driver in an
 * integrated terminal. The controller only stamps run state; the actual loop is
 * driven by a Claude session running the `autonomous-feature` skill, so the
 * extension hands off to that session rather than calling `controller.py init`
 * itself (which would create an orphan run the skill's own init then rejects).
 *
 * The command is typed into the terminal but NOT executed — the user reviews it
 * and presses Enter, keeping a human in the loop before any work begins. We
 * never pass permission-bypass flags; the driver session prompts as usual.
 */
export async function startRun(projectRoot: string, deps: ControllerCommandDeps): Promise<void> {
  if (!isWorkspaceTrusted()) {
    void vscode.window.showErrorMessage(
      'Starting an autonomous-development run requires a trusted workspace.'
    );
    return;
  }
  const feature = await vscode.window.showInputBox({
    title: 'Start Autonomous Development Run',
    prompt: 'Describe the feature to implement',
    placeHolder: 'e.g. Add CSV export to the report page',
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim().length === 0 ? 'A feature description is required.' : undefined
  });
  if (feature === undefined || feature.trim().length === 0) {
    return;
  }

  const pluginDir = pluginDirFromControllerPath(deps.getConfig().controllerPath);
  const launchParts = ['claude'];
  if (pluginDir) {
    launchParts.push('--plugin-dir', shellSingleQuote(pluginDir));
  }
  const launchLine = launchParts.join(' ');
  const skillCommand = `/autonomous-development:autonomous-feature ${feature.trim()}`;

  const terminal = vscode.window.createTerminal({
    cwd: projectRoot,
    name: 'Autonomous Development'
  });
  terminal.show();
  // Launch the driver session, then pre-fill the skill command without a
  // trailing newline so the user presses Enter to confirm the launch.
  terminal.sendText(launchLine, true);
  terminal.sendText(skillCommand, false);
  void vscode.window.showInformationMessage(
    'Claude is starting in the terminal. Review the pre-filled command, then press Enter to begin the run.'
  );
}

export async function evaluateGates(
  run: DiscoveredRun,
  deps: ControllerCommandDeps
): Promise<void> {
  if (!(await ensureConfigured(deps.service))) {
    return;
  }
  try {
    const result = await runWithProgress(`Evaluating completion gates for ${run.runId}…`, () =>
      deps.service.executeForRun('evaluate', run)
    );
    deps.refresh();
    const summary = result.stdout.trim().split('\n').slice(-1)[0] ?? 'Evaluation complete.';
    void vscode.window.showInformationMessage(`Completion-gate evaluation finished: ${summary}`);
  } catch (err) {
    reportError(err);
  }
}

export async function acceptDrift(run: DiscoveredRun, deps: ControllerCommandDeps): Promise<void> {
  if (!(await ensureConfigured(deps.service))) {
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Accept repository drift for run ${run.runId}? This records the working-tree drift as intentional.`,
    { modal: true },
    'Accept Drift'
  );
  if (confirm !== 'Accept Drift') {
    return;
  }
  try {
    await runWithProgress(`Accepting drift for ${run.runId}…`, () =>
      deps.service.executeForRun('accept-drift', run)
    );
    deps.refresh();
    void vscode.window.showInformationMessage(`Recorded accepted drift for ${run.runId}.`);
  } catch (err) {
    reportError(err);
  }
}

export async function cancelRun(run: DiscoveredRun, deps: ControllerCommandDeps): Promise<void> {
  if (!(await ensureConfigured(deps.service))) {
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Cancel run ${run.runId}? This marks the run cancelled and cannot be undone.`,
    { modal: true },
    'Cancel Run'
  );
  if (confirm !== 'Cancel Run') {
    return;
  }
  const reason = await vscode.window.showInputBox({
    prompt: 'Optional cancellation reason',
    placeHolder: 'Why is this run being cancelled?'
  });
  // showInputBox returns undefined when dismissed with Escape — proceed without a reason only
  // if the modal confirm already happened; an explicit Escape here aborts to be safe.
  if (reason === undefined) {
    return;
  }
  try {
    await runWithProgress(`Cancelling ${run.runId}…`, () =>
      deps.service.executeForRun('cancel', run, reason.length > 0 ? { reason } : {})
    );
    deps.refresh();
    void vscode.window.showInformationMessage(`Run ${run.runId} cancelled.`);
  } catch (err) {
    reportError(err);
  }
}

export async function archiveRun(run: DiscoveredRun, deps: ControllerCommandDeps): Promise<void> {
  if (!(await ensureConfigured(deps.service))) {
    return;
  }
  const confirm = await vscode.window.showWarningMessage(
    `Archive run ${run.runId}? It will move to the Archived Runs view.`,
    { modal: true },
    'Archive Run'
  );
  if (confirm !== 'Archive Run') {
    return;
  }
  try {
    await runWithProgress(`Archiving ${run.runId}…`, () =>
      deps.service.executeForRun('archive-run', run)
    );
    deps.refresh();
    void vscode.window.showInformationMessage(`Run ${run.runId} archived.`);
  } catch (err) {
    reportError(err);
  }
}
