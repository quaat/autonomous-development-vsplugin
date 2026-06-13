import * as vscode from 'vscode';

/**
 * Context key mirrored from `vscode.workspace.isTrusted`. The package.json
 * `when` clauses gate every mutation/setup command on `autonomousDev.trusted`;
 * the controller service ALSO re-checks `isTrusted` at call time so a stale
 * context key can never authorize execution (defense in depth).
 */
export const TRUSTED_CONTEXT_KEY = 'autonomousDev.trusted';

export function registerTrustContext(context: vscode.ExtensionContext): void {
  const apply = (): void => {
    void vscode.commands.executeCommand(
      'setContext',
      TRUSTED_CONTEXT_KEY,
      vscode.workspace.isTrusted
    );
  };
  apply();
  context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(apply));
}

/** True only when the workspace is trusted; the single runtime gate. */
export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted;
}
