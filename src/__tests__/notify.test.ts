import { describe, expect, test } from 'bun:test';
import { diffTransitions, describe as describeTr } from '../notify.ts';
import type { ProjectData, Run } from '../model.ts';

const run = (id: number, status: Run['status'], stages: Run['stages'] = []): Run => ({
  id, name: `Run-${id}`, status, by: 'x', queued: '2026-08-28T10:00:00Z', url: '', stages,
});
const snap = (latest?: Run): ProjectData[] => [
  { key: 'p', name: 'P', pipelines: [{ key: 'p:pipeline:1', kind: 'pipeline', id: 1, name: 'Build', projectKey: 'p', projectName: 'P', latest, history: [] }], releases: [] },
];

describe('diffTransitions', () => {
  test('running → succeeded notifies', () => {
    const t = diffTransitions(snap(run(1, 'running')), snap(run(1, 'succeeded')));
    expect(t).toHaveLength(1);
    expect(t[0]!.to).toBe('succeeded');
    expect(describeTr(t[0]!).body).toBe('Run-1 succeeded');
  });
  test('running → failed notifies', () => {
    expect(diffTransitions(snap(run(1, 'running')), snap(run(1, 'failed')))).toHaveLength(1);
  });
  test('no change → nothing', () => {
    expect(diffTransitions(snap(run(1, 'succeeded')), snap(run(1, 'succeeded')))).toHaveLength(0);
  });
  test('first poll with completed run → nothing', () => {
    expect(diffTransitions(undefined, snap(run(1, 'succeeded')))).toHaveLength(0);
  });
  test('new run already completed (missed it) → nothing', () => {
    expect(diffTransitions(snap(run(1, 'succeeded')), snap(run(2, 'succeeded')))).toHaveLength(0);
  });
  test('pending approval notifies even on first sight', () => {
    const t = diffTransitions(undefined, snap(run(1, 'pending-approval', [{ name: 'production', status: 'pending-approval', approvalId: 1 }])));
    expect(t).toHaveLength(1);
    expect(describeTr(t[0]!).body).toBe('Run-1 waiting for production approval');
  });
  test('queued → running does not notify', () => {
    expect(diffTransitions(snap(run(1, 'queued')), snap(run(1, 'running')))).toHaveLength(0);
  });
});
