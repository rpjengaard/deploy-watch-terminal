import { describe, expect, test } from 'bun:test';
import { groupHits } from '../find.ts';

const projects = [
  {
    name: 'Common',
    pipelines: [
      { id: 213, name: '10344ra BE Dev Build', path: '\\10344ra' },
      { id: 223, name: '10344ra FE Build and Deploy', path: '\\10344ra' },
      { id: 178, name: '10280he BE Dev Build', path: '\\10280he' },
    ],
    releases: [{ id: 16, name: '10344ra main be deploy', path: '\\10344ra' }],
  },
  {
    name: '8903da - Acme - Intranet',
    pipelines: [{ id: 104, name: 'DEV BE Build', path: '\\' }],
    releases: [{ id: 1, name: '8903da dev be deploy', path: '\\' }],
  },
];

describe('groupHits', () => {
  test('folder match in shared project → folder config', () => {
    const h = groupHits('10344', projects);
    expect(h).toHaveLength(1);
    expect(h[0]!.pipelines.map((d) => d.id)).toEqual([213, 223]);
    expect(h[0]!.releases.map((d) => d.id)).toEqual([16]);
    expect(h[0]!.suggested).toEqual({ key: '10344ra', name: 'Common', folder: '10344ra' });
  });
  test('project-name match → whole project, no folder', () => {
    const h = groupHits('8903', projects);
    expect(h).toHaveLength(1);
    expect(h[0]!.suggested).toEqual({ key: '8903da', name: '8903da - Acme - Intranet' });
    expect(h[0]!.pipelines).toHaveLength(1);
  });
  test('no match', () => {
    expect(groupHits('zzz', projects)).toHaveLength(0);
  });
});
