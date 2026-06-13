import * as vscode from 'vscode';

export const CONFIG_SECTION = 'autonomousDev';

export type NotificationLevel = 'all' | 'important' | 'none';

export interface ExtensionConfig {
  /** Empty string ⇒ observer-only mode (no controller). */
  readonly controllerPath: string;
  /** Empty string ⇒ resolve via env/platform default. */
  readonly stateHome: string;
  readonly pythonPath: string;
  readonly autoRefresh: boolean;
  readonly notificationLevel: NotificationLevel;
  readonly maxEventLogEntries: number;
  readonly loadCompletedRuns: boolean;
  readonly loadArchivedRuns: boolean;
}

export function readConfig(): ExtensionConfig {
  const c = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    controllerPath: (c.get<string>('controllerPath') ?? '').trim(),
    stateHome: (c.get<string>('stateHome') ?? '').trim(),
    pythonPath: (c.get<string>('pythonPath') ?? 'python3').trim() || 'python3',
    autoRefresh: c.get<boolean>('autoRefresh') ?? true,
    notificationLevel: c.get<NotificationLevel>('notificationLevel') ?? 'important',
    maxEventLogEntries: c.get<number>('maxEventLogEntries') ?? 5000,
    loadCompletedRuns: c.get<boolean>('loadCompletedRuns') ?? true,
    loadArchivedRuns: c.get<boolean>('loadArchivedRuns') ?? false
  };
}

/** Persist the controller path (used by guided setup). */
export async function updateControllerPath(
  value: string,
  target: vscode.ConfigurationTarget
): Promise<void> {
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update('controllerPath', value, target);
}
