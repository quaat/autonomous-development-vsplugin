import * as vscode from 'vscode';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Watches the state home (and legacy in-repo layouts) for run changes and emits
 * a single debounced event. Create/change/delete all funnel into the same
 * signal so atomic file replacement (write-temp + rename) is handled correctly:
 * the consumer simply re-reads from disk, where core's tolerant parsers absorb a
 * momentarily half-written file.
 */
export class StateWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS) {}

  /** Recreate watchers for a new state home and the current workspace folders. */
  reconfigure(stateHome: string): void {
    this.disposeWatchers();

    const repositories = new vscode.RelativePattern(vscode.Uri.file(stateHome), 'repositories/**');
    this.addWatcher(repositories);

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const legacy = new vscode.RelativePattern(folder, '.ai/autonomous-development/**');
      this.addWatcher(legacy);
    }
  }

  private addWatcher(pattern: vscode.RelativePattern): void {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = (): void => this.schedule();
    watcher.onDidCreate(trigger);
    watcher.onDidChange(trigger);
    watcher.onDidDelete(trigger);
    this.watchers.push(watcher);
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.emitter.fire();
    }, this.debounceMs);
  }

  private disposeWatchers(): void {
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.disposeWatchers();
    this.emitter.dispose();
  }
}
