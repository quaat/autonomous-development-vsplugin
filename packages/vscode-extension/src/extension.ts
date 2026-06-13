import * as vscode from 'vscode';
import type { DiscoveredRun, RunGroup } from '@semanticmatter/core';

import { registerCommands } from './commands';
import { CONFIG_SECTION, readConfig, type ExtensionConfig } from './config';
import { ControllerService } from './controller/controllerService';
import { RunNotifier } from './notifications';
import { OutputLog } from './output';
import { RunStore } from './runStore';
import { RunStatusBar } from './statusBar';
import { RunTreeProvider } from './tree/runTreeProvider';
import type { RunNode, TreeNode } from './tree/runTreeItem';
import { registerTrustContext } from './trust';
import { StateWatcher } from './watcher';

/**
 * Read-only surface returned from {@link activate} so integration tests can
 * observe discovery and grouping without reaching into private internals. Not
 * part of any public contributed API.
 */
export interface AutonomousDevApi {
  readonly getRuns: () => readonly DiscoveredRun[];
  readonly getRunsForGroup: (group: RunGroup) => readonly DiscoveredRun[];
  readonly getStateHome: () => string;
  readonly refresh: () => void;
}

export function activate(context: vscode.ExtensionContext): AutonomousDevApi {
  let config: ExtensionConfig = readConfig();
  const getConfig = (): ExtensionConfig => config;

  const log = new OutputLog();
  context.subscriptions.push(log);
  log.info('Autonomous Development extension activated.');

  registerTrustContext(context);

  const store = new RunStore(config, log);
  context.subscriptions.push(store);

  const service = new ControllerService(getConfig, () => store.activeStateHome, log);

  const statusBar = new RunStatusBar(store);
  const notifier = new RunNotifier(store, getConfig);
  context.subscriptions.push(statusBar, notifier);

  // Three tree views over the one store.
  const activeProvider = new RunTreeProvider(store, 'active');
  const completedProvider = new RunTreeProvider(store, 'completed');
  const archivedProvider = new RunTreeProvider(store, 'archived');
  context.subscriptions.push(activeProvider, completedProvider, archivedProvider);

  const wireView = (id: string, provider: RunTreeProvider): void => {
    const view = vscode.window.createTreeView<TreeNode>(id, {
      treeDataProvider: provider,
      showCollapseAll: true
    });
    view.onDidChangeSelection((e) => {
      const node = e.selection[0];
      if (node && node.kind === 'run') {
        store.select((node as RunNode).run);
      }
    });
    context.subscriptions.push(view);
  };
  wireView('autonomousDev.activeRuns', activeProvider);
  wireView('autonomousDev.completedRuns', completedProvider);
  wireView('autonomousDev.archivedRuns', archivedProvider);

  store.onDidChange(
    () => {
      activeProvider.refresh();
      completedProvider.refresh();
      archivedProvider.refresh();
    },
    null,
    context.subscriptions
  );

  registerCommands({
    context,
    store,
    service,
    log,
    getConfig,
    getStateHome: () => store.activeStateHome,
    refresh: () => store.refresh()
  });

  // File watching → debounced refresh (respecting the autoRefresh setting).
  const watcher = new StateWatcher();
  context.subscriptions.push(watcher);
  watcher.reconfigure(store.activeStateHome);
  watcher.onDidChange(
    () => {
      if (getConfig().autoRefresh) {
        store.refresh();
      }
    },
    null,
    context.subscriptions
  );

  // React to configuration changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      config = readConfig();
      store.updateConfig(config);
      notifier.updateConfig(getConfig);
      watcher.reconfigure(store.activeStateHome);
      store.refresh();
    })
  );

  // React to workspace folder changes (legacy run detection + legacy watchers).
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      watcher.reconfigure(store.activeStateHome);
      store.refresh();
    })
  );

  // Initial population.
  store.refresh();

  return {
    getRuns: () => store.allRuns,
    getRunsForGroup: (group) => store.runsForGroup(group),
    getStateHome: () => store.activeStateHome,
    refresh: () => store.refresh()
  };
}

export function deactivate(): void {
  // All disposables are registered on the extension context.
}
