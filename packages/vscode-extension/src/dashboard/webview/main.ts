/**
 * Dashboard webview entry. Runs in the sandboxed webview (no Node, no vscode
 * module, strict CSP). It only renders the {@link DashboardView} it is sent and
 * posts intent messages back to the host — it performs no IO and holds no
 * secrets. All dynamic text goes through textContent (never innerHTML) so a
 * malicious artifact value cannot inject markup.
 */

import type {
  DashboardArtifact,
  DashboardCheck,
  DashboardReviewRound,
  DashboardStage,
  DashboardView,
  WebviewMessage
} from '../viewTypes';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

type Child = Node | string | null | undefined | false;

function el(tag: string, props: Record<string, string> = {}, children: Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') {
      node.className = v;
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function section(title: string, ...children: Child[]): HTMLElement {
  return el('section', { class: 'card' }, [el('h2', {}, [title]), ...children]);
}

function kv(label: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, [
    el('span', { class: 'kv-label' }, [label]),
    el('span', { class: 'kv-value' }, [value])
  ]);
}

function button(
  label: string,
  onClick: () => void,
  props: Record<string, string> = {}
): HTMLElement {
  const b = el('button', { type: 'button', ...props }, [label]) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

function command(commandId: string): void {
  vscode.postMessage({ type: 'command', command: commandId });
}

function renderHeader(view: DashboardView): HTMLElement {
  const featureLine = (view.feature.split('\n')[0] ?? view.feature) || view.runId;
  const badges = el('div', { class: 'badges' }, [
    el('span', { class: `badge status-${view.status}` }, [view.status]),
    view.phase && el('span', { class: 'badge phase' }, [view.phase]),
    view.gatesPass
      ? el('span', { class: 'badge ok' }, ['gates pass'])
      : el('span', { class: 'badge warn' }, ['gates pending'])
  ]);
  const meta: Child[] = [
    kv('Run ID', view.runId),
    kv('Repository', view.repository.displayName ?? view.repository.id)
  ];
  if (view.repository.worktreePath) meta.push(kv('Worktree', view.repository.worktreePath));
  if (view.repository.remoteDisplay) meta.push(kv('Remote', view.repository.remoteDisplay));
  if (view.createdAt) meta.push(kv('Created', view.createdAt));
  if (view.updatedAt) meta.push(kv('Updated', view.updatedAt));

  return el('header', { class: 'card header' }, [
    el('h1', {}, [featureLine]),
    badges,
    view.blockingReason
      ? el('p', { class: 'blocking' }, [`Blocked: ${view.blockingReason}`])
      : null,
    el('div', { class: 'meta' }, meta)
  ]);
}

function renderStages(stages: readonly DashboardStage[]): HTMLElement {
  const items = stages.map((s) =>
    el('li', { class: `stage stage-${s.status}`, title: s.detail ?? s.status }, [
      el('span', { class: 'stage-dot' }, []),
      el('span', { class: 'stage-title' }, [s.title]),
      el('span', { class: 'stage-status' }, [s.status])
    ])
  );
  return section('Workflow timeline', el('ol', { class: 'stages' }, items));
}

function renderStatus(view: DashboardView): HTMLElement {
  const gateList = view.gateFailures.length
    ? el(
        'ul',
        { class: 'gates' },
        view.gateFailures.map((g) => el('li', { class: 'gate' }, [g.message]))
      )
    : el('p', { class: 'ok' }, ['All completion gates pass.']);

  return section(
    'Current status',
    el('div', { class: 'status-grid' }, [
      kv('Phase', view.phase || '—'),
      kv('Status', view.status),
      kv(
        'Review budget',
        `${view.reviewBudget.consumed}/${view.reviewBudget.max} used (${view.reviewBudget.remaining} left)`
      ),
      kv(
        'Verification',
        view.verification.hasChecks
          ? `${view.verification.passedCount}/${view.verification.total} passing`
          : 'no checks'
      ),
      kv('Latest review', view.review.latestVerdict ?? 'none'),
      kv(
        'Risk',
        view.risk.requiresAdversarialReview
          ? `adversarial required (${view.risk.reasons.join(', ') || 'unspecified'})`
          : 'standard'
      )
    ]),
    el('h3', {}, ['Completion gates']),
    gateList,
    el('div', { class: 'next-action' }, [
      el('strong', {}, ['Recommended next action: ']),
      view.nextAction.message || '—'
    ])
  );
}

function renderArtifactSummary(a: DashboardArtifact): HTMLElement | null {
  const sections = a.sections ?? [];
  if (sections.length === 0) {
    return null;
  }
  const total = sections.reduce((sum, s) => sum + s.items.length, 0);
  return el('details', { class: 'artifact-summary' }, [
    el('summary', {}, [`Semantic summary (${total})`]),
    ...sections.map((s) =>
      el('div', { class: 'summary-section' }, [
        el('h4', {}, [`${s.label} (${s.items.length})`]),
        el(
          'ul',
          { class: 'summary-list' },
          s.items.map((item) => el('li', {}, [item]))
        )
      ])
    )
  ]);
}

function renderArtifacts(view: DashboardView): HTMLElement {
  const rows = view.artifacts.map((a: DashboardArtifact) =>
    el('li', { class: `artifact ${a.exists ? 'present' : 'absent'}` }, [
      el('div', { class: 'artifact-row' }, [
        button(
          a.title,
          () => command(a.command),
          a.exists ? {} : { disabled: 'true', title: `${a.filename ?? ''} not found` }
        ),
        el('span', { class: 'artifact-file' }, [a.exists ? (a.filename ?? '') : 'not present'])
      ]),
      renderArtifactSummary(a)
    ])
  );
  const compare = el('div', { class: 'compare-actions' }, [
    button('Compare idea ↔ accepted spec', () => command('autonomousDev.compareSpec')),
    button('Compare proposed ↔ accepted plan', () => command('autonomousDev.comparePlan'))
  ]);
  return section('Prompt & artifact evolution', el('ol', { class: 'artifacts' }, rows), compare);
}

function renderVerification(view: DashboardView): HTMLElement {
  if (!view.verification.hasChecks) {
    return section(
      'Verification',
      el('p', { class: 'muted' }, ['No verification checks have been recorded.'])
    );
  }
  const rows = view.verification.checks.map((c: DashboardCheck) => {
    const status = c.passed ? 'pass' : 'fail';
    const cells: Child[] = [
      el('td', {}, [c.name]),
      el('td', { class: 'mono' }, [c.command]),
      el('td', { class: `check-${status}` }, [c.passed ? 'pass' : `exit ${c.exitCode ?? '?'}`]),
      el('td', {}, [c.attempts > 1 ? `${c.attempts} attempts` : '1 attempt']),
      el('td', {}, [c.completedAt ?? c.startedAt ?? ''])
    ];
    const logCell = el('td', {}, [
      c.log
        ? button(
            'log',
            () => vscode.postMessage({ type: 'openVerificationLog', log: c.log as string }),
            { class: 'link' }
          )
        : ''
    ]);
    cells.push(logCell);
    return el('tr', {}, cells);
  });
  const head = el(
    'tr',
    {},
    ['Check', 'Command', 'Result', 'Attempts', 'Completed', 'Log'].map((h) => el('th', {}, [h]))
  );
  return section(
    'Verification',
    el('table', { class: 'checks' }, [el('thead', {}, [head]), el('tbody', {}, rows)])
  );
}

function renderFinding(round: DashboardReviewRound): HTMLElement[] {
  return round.findings.map((f) => {
    const head = el('div', { class: 'finding-head' }, [
      el('span', { class: `sev sev-${(f.severity ?? 'unknown').toLowerCase()}` }, [
        f.severity ?? 'unknown'
      ]),
      f.category ? el('span', { class: 'cat' }, [f.category]) : null,
      f.id ? el('span', { class: 'fid' }, [f.id]) : null,
      f.file
        ? button(
            `${f.file}${f.line ? `:${f.line}` : ''}`,
            () =>
              vscode.postMessage({
                type: 'openFinding',
                file: f.file as string,
                line: f.line ?? null
              }),
            { class: 'link' }
          )
        : null,
      f.disposition
        ? el('span', { class: `disp disp-${f.disposition}` }, [f.disposition.replace(/_/g, ' ')])
        : null
    ]);
    const body: Child[] = [];
    if (f.description) body.push(el('p', { class: 'finding-desc' }, [f.description]));
    if (f.evidence)
      body.push(
        el('details', {}, [
          el('summary', {}, ['Evidence']),
          el('pre', { class: 'mono' }, [f.evidence])
        ])
      );
    if (f.recommendedFix)
      body.push(
        el('details', {}, [el('summary', {}, ['Recommended fix']), el('p', {}, [f.recommendedFix])])
      );
    return el('div', { class: 'finding' }, [head, ...body]);
  });
}

function renderReviewRounds(title: string, rounds: readonly DashboardReviewRound[]): HTMLElement {
  if (rounds.length === 0) {
    return section(title, el('p', { class: 'muted' }, ['None recorded.']));
  }
  const blocks = rounds.map((r) => {
    const counts = Object.entries(r.findingCountsBySeverity)
      .map(([sev, n]) => `${n} ${sev}`)
      .join(', ');
    const header = el('div', { class: 'round-head' }, [
      el('span', { class: 'round-num' }, [`Round ${r.round ?? '?'}`]),
      el('span', { class: `verdict verdict-${(r.verdict ?? 'unknown').toLowerCase()}` }, [
        r.verdict ?? (r.readable ? 'no verdict' : 'unreadable')
      ]),
      r.confidence !== undefined
        ? el('span', { class: 'conf' }, [`confidence ${r.confidence}`])
        : null,
      counts ? el('span', { class: 'counts' }, [counts]) : null
    ]);
    const body = r.readable
      ? r.findings.length
        ? el('div', { class: 'findings' }, renderFinding(r))
        : el('p', { class: 'ok' }, ['No findings.'])
      : el('p', { class: 'muted' }, [
          'This review file could not be read; showing cached verdict only.'
        ]);
    return el('div', { class: 'round' }, [
      header,
      r.summary ? el('p', { class: 'round-summary' }, [r.summary]) : null,
      body,
      ...renderReviewMetadata(r)
    ]);
  });
  return section(title, ...blocks);
}

function renderReviewMetadata(round: DashboardReviewRound): Child[] {
  const extras: Child[] = [];
  if (round.acceptanceCriteria.length > 0) {
    extras.push(
      el('details', { class: 'ac' }, [
        el('summary', {}, [`Acceptance criteria (${round.acceptanceCriteria.length})`]),
        el(
          'ul',
          { class: 'ac-list' },
          round.acceptanceCriteria.map((a) =>
            el('li', { class: `ac-item ac-${(a.status ?? 'unknown').toLowerCase()}` }, [
              el('span', { class: 'ac-id' }, [a.id ?? '—']),
              el('span', { class: 'ac-status' }, [a.status ?? 'unknown']),
              a.evidence ? el('span', { class: 'ac-evidence' }, [a.evidence]) : null
            ])
          )
        )
      ])
    );
  }
  if (round.verificationGaps.length > 0) {
    extras.push(
      el('details', { class: 'gaps' }, [
        el('summary', {}, [`Verification gaps (${round.verificationGaps.length})`]),
        el(
          'ul',
          { class: 'gap-list' },
          round.verificationGaps.map((g) => el('li', {}, [g]))
        )
      ])
    );
  }
  return extras;
}

function renderTriage(view: DashboardView): HTMLElement | null {
  const files = view.review.triageFiles;
  if (files.length === 0) {
    return null;
  }
  return section(
    'Finding triage',
    el('p', { class: 'muted' }, [
      'Legacy triage notes, shown read-only. No structured disposition is inferred from them.'
    ]),
    el(
      'ul',
      { class: 'triage' },
      files.map((t) =>
        el('li', { class: 'triage-file' }, [
          button(t.filename, () => vscode.postMessage({ type: 'openRunFile', file: t.filename }), {
            class: 'link'
          })
        ])
      )
    )
  );
}

function renderTimeline(view: DashboardView): HTMLElement | null {
  if (view.timeline.length === 0) {
    return null;
  }
  const items = view.timeline.map((e) =>
    el('li', { class: 'event' }, [
      el('span', { class: 'event-seq' }, [`#${e.sequence}`]),
      el('span', { class: 'event-time' }, [e.timestamp]),
      el('span', { class: 'event-type' }, [e.type]),
      el('span', { class: 'event-summary' }, [e.summary])
    ])
  );
  return section(
    'Event log',
    view.truncatedTimeline
      ? el('p', { class: 'muted' }, ['The final log line was truncated and skipped.'])
      : null,
    el('ol', { class: 'events' }, items)
  );
}

function renderDiagnostics(view: DashboardView): HTMLElement | null {
  if (view.diagnostics.length === 0) {
    return null;
  }
  return section(
    'Diagnostics',
    el(
      'ul',
      { class: 'diagnostics' },
      view.diagnostics.map((d) =>
        el('li', { class: `diag diag-${d.severity}` }, [`${d.severity}: ${d.message}`])
      )
    )
  );
}

function render(view: DashboardView): void {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }
  app.textContent = '';
  const fragments: Child[] = [
    renderHeader(view),
    renderStages(view.stages),
    renderStatus(view),
    renderArtifacts(view),
    renderVerification(view),
    renderReviewRounds('Independent review', view.review.rounds),
    renderTriage(view),
    view.adversarial.required
      ? renderReviewRounds('Adversarial review', view.adversarial.rounds)
      : null,
    renderTimeline(view),
    renderDiagnostics(view)
  ];
  for (const f of fragments) {
    if (f && typeof f !== 'string') {
      app.append(f);
    }
  }
}

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { type?: string; view?: DashboardView };
  if (data && data.type === 'render' && data.view) {
    render(data.view);
  }
});

vscode.postMessage({ type: 'ready' });
