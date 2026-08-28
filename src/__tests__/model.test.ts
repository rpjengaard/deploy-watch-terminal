import { describe, expect, test } from 'bun:test';
import { buildStatus, envStatus, releaseStatus, timelineStatus, anyActive } from '../model.ts';
import { mockProjects } from '../mock.ts';

describe('buildStatus', () => {
  test('maps build status/result', () => {
    expect(buildStatus('inProgress')).toBe('running');
    expect(buildStatus('notStarted')).toBe('queued');
    expect(buildStatus('completed', 'succeeded')).toBe('succeeded');
    expect(buildStatus('completed', 'partiallySucceeded')).toBe('partial');
    expect(buildStatus('completed', 'failed')).toBe('failed');
    expect(buildStatus('completed', 'canceled')).toBe('canceled');
    expect(buildStatus(undefined)).toBe('unknown');
  });
});

describe('timelineStatus', () => {
  test('maps timeline records', () => {
    expect(timelineStatus('pending')).toBe('notStarted');
    expect(timelineStatus('inProgress')).toBe('running');
    expect(timelineStatus('completed', 'skipped')).toBe('skipped');
    expect(timelineStatus('completed', 'succeededWithIssues')).toBe('partial');
  });
});

describe('envStatus / releaseStatus', () => {
  test('pending approval wins', () => {
    expect(envStatus('inProgress', true)).toBe('pending-approval');
    expect(envStatus('inProgress')).toBe('running');
    expect(envStatus('rejected')).toBe('failed');
  });
  test('release derives from stages', () => {
    expect(releaseStatus([{ name: 's', status: 'succeeded' }, { name: 'p', status: 'pending-approval' }])).toBe('pending-approval');
    expect(releaseStatus([{ name: 's', status: 'succeeded' }, { name: 'p', status: 'running' }])).toBe('running');
    expect(releaseStatus([{ name: 's', status: 'succeeded' }, { name: 'p', status: 'notStarted' }])).toBe('succeeded');
    expect(releaseStatus([{ name: 's', status: 'succeeded' }, { name: 'p', status: 'failed' }])).toBe('failed');
    expect(releaseStatus([{ name: 's', status: 'notStarted' }])).toBe('notStarted');
  });
});

describe('anyActive', () => {
  test('detects running work in mock', () => {
    expect(anyActive(mockProjects(0))).toBe(true);
  });
});

import { inFolder, displayProject } from '../ado.ts';
describe('inFolder', () => {
  test('matches folder and subfolders, ignores case and slashes', () => {
    expect(inFolder('\\10260ny', '10260ny')).toBe(true);
    expect(inFolder('\\10260ny\\sub', '10260ny')).toBe(true);
    expect(inFolder('\\10260NY', '\\10260ny')).toBe(true);
    expect(inFolder('\\10260nyx', '10260ny')).toBe(false);
    expect(inFolder('\\', '10260ny')).toBe(false);
    expect(inFolder('\\anything', undefined)).toBe(true);
  });
  test('displayProject', () => {
    expect(displayProject({ key: 'k', name: 'Common', folder: '10260ny' })).toBe('Common \\ 10260ny');
    expect(displayProject({ key: 'k', name: 'X' })).toBe('X');
  });
});
