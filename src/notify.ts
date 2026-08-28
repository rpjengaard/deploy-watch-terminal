import { spawn } from 'node:child_process';
import type { ProjectData, Status } from './model.ts';
import { allTracks } from './model.ts';

export interface Transition {
  trackName: string;
  projectKey: string;
  runName: string;
  from?: Status;
  to: Status;
  stage?: string;
}

const NOTIFY_ON: ReadonlySet<Status> = new Set(['succeeded', 'partial', 'failed', 'canceled', 'pending-approval']);

/**
 * Compare previous and next snapshots; returns transitions worth notifying about.
 * A run is "the same" if track key + run id match. A run that first appears already
 * in a terminal state is NOT reported (we didn't watch it happen) — except
 * pending-approval, which is still actionable.
 */
export function diffTransitions(prev: ProjectData[] | undefined, next: ProjectData[]): Transition[] {
  const out: Transition[] = [];
  const prevMap = new Map(prev ? allTracks(prev).map((t) => [t.key, t]) : []);
  for (const t of allTracks(next)) {
    if (!t.latest) continue;
    const before = prevMap.get(t.key);
    const beforeRun = before?.latest?.id === t.latest.id ? before.latest : undefined;
    const from = beforeRun?.status;
    const to = t.latest.status;
    if (from === to) continue;
    if (!NOTIFY_ON.has(to)) continue;
    if (!beforeRun && to !== 'pending-approval') continue;
    const stage = t.latest.stages.find((s) => s.status === 'pending-approval')?.name;
    out.push({ trackName: t.name, projectKey: t.projectKey, runName: t.latest.name, from, to, stage });
  }
  return out;
}

export function describe(tr: Transition): { title: string; body: string } {
  const title = `${tr.projectKey} · ${tr.trackName}`;
  const body =
    tr.to === 'pending-approval'
      ? `${tr.runName} waiting for ${tr.stage ?? 'stage'} approval`
      : `${tr.runName} ${tr.to}`;
  return { title, body };
}

export function notifyMac(title: string, body: string) {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const sound = /fail|cancel/.test(body) ? 'Basso' : 'Glass';
  spawn('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}" sound name "${sound}"`], {
    stdio: 'ignore',
    detached: true,
  }).unref();
}

export function bell() {
  process.stdout.write('\x07');
}
