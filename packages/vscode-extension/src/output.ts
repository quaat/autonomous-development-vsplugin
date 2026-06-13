import { redactCredentials } from '@semanticmatter/core';
import * as vscode from 'vscode';

const OUTPUT_CHANNEL_NAME = 'Autonomous Development';

/**
 * Strip credentials from a string before logging. Delegates to the core
 * canonical redactor so the extension and view model share one rule.
 * Defense-in-depth: artifacts and remote URLs recorded by the controller are
 * already redacted, but extension logs must never reintroduce a secret.
 */
export function redactSecrets(text: string): string {
  return redactCredentials(text);
}

/** Thin wrapper over an OutputChannel that always redacts before writing. */
export class OutputLog {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }

  private stamp(): string {
    return new Date().toISOString();
  }

  info(message: string): void {
    this.channel.appendLine(`[${this.stamp()}] ${redactSecrets(message)}`);
  }

  warn(message: string): void {
    this.channel.appendLine(`[${this.stamp()}] WARN  ${redactSecrets(message)}`);
  }

  error(message: string): void {
    this.channel.appendLine(`[${this.stamp()}] ERROR ${redactSecrets(message)}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
