/**
 * Explicit adapter *interfaces* for future live integrations. This release ships
 * NO implementations (a non-goal): the observer reads state and the typed event
 * log. These contracts exist so later work can add Claude Agent SDK / Codex
 * app-server orchestration behind a stable seam without reshaping core.
 *
 * Every adapter is a source of {@link RunEvent}s appended to events.jsonl, which
 * the rest of core already understands.
 */

import type { RunEvent } from '@semanticmatter/protocol';

export type AdapterKind = 'claude-agent' | 'codex-app-server';

export interface AdapterDescriptor {
  readonly kind: AdapterKind;
  readonly displayName: string;
  /** Whether a working implementation is wired up (always false this release). */
  readonly available: boolean;
}

/** A sink the host provides; adapters emit envelope-ready events into it. */
export interface RunEventSink {
  emit(event: RunEvent): void | Promise<void>;
}

/** Common shape: a live driver that streams events for a single run. */
export interface RunEventSource {
  readonly descriptor: AdapterDescriptor;
  /** Begin streaming; resolves when the source has fully detached. */
  start(sink: RunEventSink, signal?: AbortSignal): Promise<void>;
}

/**
 * Future: drive a run via the Claude Agent SDK. Implementation deferred.
 */
export interface ClaudeAgentAdapter extends RunEventSource {
  readonly descriptor: AdapterDescriptor & { kind: 'claude-agent' };
}

/**
 * Future: observe/drive Codex via its app-server. Implementation deferred.
 */
export interface CodexAppServerAdapter extends RunEventSource {
  readonly descriptor: AdapterDescriptor & { kind: 'codex-app-server' };
}

export const CLAUDE_AGENT_DESCRIPTOR: AdapterDescriptor = {
  kind: 'claude-agent',
  displayName: 'Claude Agent SDK',
  available: false
};

export const CODEX_APP_SERVER_DESCRIPTOR: AdapterDescriptor = {
  kind: 'codex-app-server',
  displayName: 'Codex app-server',
  available: false
};
