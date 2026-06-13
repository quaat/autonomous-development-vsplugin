import { dirname } from 'node:path';

import * as vscode from 'vscode';
import type { ControllerContext } from '@semanticmatter/core';

import { CONFIG_SECTION, updateControllerPath, type ExtensionConfig } from './config';
import { ControllerError, type ControllerService } from './controller/controllerService';
import type { OutputLog } from './output';
import { isWorkspaceTrusted } from './trust';

export interface SetupDeps {
  readonly service: ControllerService;
  readonly getConfig: () => ExtensionConfig;
  readonly getStateHome: () => string;
  readonly log: OutputLog;
  readonly refresh: () => void;
}

function projectRoot(controllerPath: string): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? dirname(controllerPath);
}

/**
 * Guided setup: locate scripts/controller.py, validate the toolchain with
 * `doctor`, and persist the path. Requires a trusted workspace because it
 * executes the external controller (`doctor`).
 */
export async function runGuidedSetup(deps: SetupDeps): Promise<void> {
  if (!isWorkspaceTrusted()) {
    void vscode.window.showWarningMessage(
      'Guided setup runs the external controller and requires a trusted workspace. Observer features work without it.'
    );
    return;
  }

  const config = deps.getConfig();
  const picked = await vscode.window.showOpenDialog({
    title: 'Select autonomous-development scripts/controller.py',
    canSelectMany: false,
    openLabel: 'Use this controller',
    filters: { Python: ['py'] },
    ...(config.controllerPath.length > 0
      ? { defaultUri: vscode.Uri.file(config.controllerPath) }
      : {})
  });
  const controllerPath = picked?.[0]?.fsPath;
  if (!controllerPath) {
    return;
  }

  const stateHome = deps.getStateHome();
  const ctx: ControllerContext = {
    pythonPath: config.pythonPath,
    controllerPath,
    projectRoot: projectRoot(controllerPath),
    ...(stateHome.length > 0 ? { stateHome } : {})
  };

  let doctorOk = false;
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Validating controller (doctor)…' },
      () => deps.service.executeWith(ctx, 'doctor')
    );
    deps.log.info(`doctor output:\n${result.stdout.trim()}`);
    doctorOk = true;
  } catch (err) {
    const message = err instanceof ControllerError ? err.message : String(err);
    deps.log.warn(`doctor failed during setup: ${message}`);
    const choice = await vscode.window.showWarningMessage(
      `Controller validation failed: ${message}`,
      { modal: true },
      'Save Path Anyway',
      'Show Output'
    );
    if (choice === 'Show Output') {
      deps.log.show();
      return;
    }
    if (choice !== 'Save Path Anyway') {
      return;
    }
  }

  const scopePick = await vscode.window.showQuickPick(
    [
      { label: 'Workspace settings', target: vscode.ConfigurationTarget.Workspace },
      { label: 'User settings', target: vscode.ConfigurationTarget.Global }
    ],
    {
      title: 'Where should the controller path be saved?',
      placeHolder: `${CONFIG_SECTION}.controllerPath`
    }
  );
  if (!scopePick) {
    return;
  }

  await updateControllerPath(controllerPath, scopePick.target);
  deps.refresh();
  void vscode.window.showInformationMessage(
    doctorOk
      ? 'Controller configured and validated. Controller actions are now available in trusted workspaces.'
      : 'Controller path saved. Validation did not pass — some controller actions may fail.'
  );
}
