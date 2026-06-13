import * as vscode from 'vscode';

/**
 * Open a document and place the cursor on a 1-based line, revealing it centered.
 * Shared by the dashboard's finding navigation and exercised directly by the
 * integration tests (a finding's file+line must land on the right source line).
 */
export async function openFileAtLine(uri: vscode.Uri, line?: number): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  if (line !== undefined && line > 0) {
    const pos = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
  return editor;
}
