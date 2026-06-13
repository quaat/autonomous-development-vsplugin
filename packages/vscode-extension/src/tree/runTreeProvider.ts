import * as vscode from 'vscode';
import type { RunGroup } from '@semanticmatter/core';

import type { RunStore } from '../runStore';
import {
  buildDetailTreeItem,
  buildRunTreeItem,
  detailNodes,
  type RunNode,
  type TreeNode
} from './runTreeItem';

/**
 * One provider instance per view (Active / Completed / Archived). All three read
 * the same {@link RunStore}; the group filter (and the load-completed /
 * load-archived settings, applied inside the store) decides what each shows.
 */
export class RunTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly store: RunStore,
    private readonly group: RunGroup
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element.kind === 'run' ? buildRunTreeItem(element) : buildDetailTreeItem(element);
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.store.runsForGroup(this.group).map((run): RunNode => ({ kind: 'run', run }));
    }
    if (element.kind === 'run') {
      return detailNodes(element.run);
    }
    return [];
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
