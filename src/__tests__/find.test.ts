import { describe, expect, test } from 'bun:test';
import { groupHits, mergeHits } from '../find.ts';
import type { Config } from '../config.ts';

const projects = [
  {
    id: 'guid-common',
    name: 'Common',
    pipelines: [
      { id: 213, name: '10344ra BE Dev Build', path: '\\10344ra' },
      { id: 223, name: '10344ra FE Build and Deploy', path: '\\10344ra' },
      { id: 178, name: '10280he BE Dev Build', path: '\\10280he' },
    ],
    releases: [
      { id: 16, name: '10344ra main be deploy', path: '\\10344ra' },
      { id: 30, name: '10013da dev be deploy', path: '\\10013da' },
    ],
  },
  {
    id: 'guid-8903',
    name: '8903da - Acme - Intranet',
    pipelines: [{ id: 104, name: 'DEV BE Build', path: '\\' }],
    releases: [{ id: 1, name: '8903da dev be deploy', path: '\\' }],
  },
  {
    id: 'guid-10013',
    name: '10013da - Acme - Web',
    pipelines: [{ id: 140, name: 'BE Build - Dev', path: '\\' }],
    releases: [{ id: 1, name: '10013da dev be deploy', path: '\\' }],
  },
];

describe('groupHits', () => {
  test('folder match in shared project → folder config', () => {
    const h = groupHits('10344', projects);
    expect(h).toHaveLength(1);
    expect(h[0]!.pipelines.map((d) => d.id)).toEqual([213, 223]);
    expect(h[0]!.releases.map((d) => d.id)).toEqual([16]);
    expect(h[0]!.suggested).toEqual({ key: '10344ra', projectId: 'guid-common', name: 'Common', folder: '10344ra', pipelines: [213, 223], releases: [16] });
  });
  test('project-name match → whole project, no folder', () => {
    const h = groupHits('8903', projects);
    expect(h).toHaveLength(1);
    expect(h[0]!.suggested).toEqual({ key: '8903da', projectId: 'guid-8903', name: '8903da - Acme - Intranet', pipelines: [104], releases: [1] });
    expect(h[0]!.pipelines).toHaveLength(1);
  });
  test('no match', () => {
    expect(groupHits('zzz', projects)).toHaveLength(0);
  });
});

describe('mergeHits', () => {
  const cfg = (): Config => ({ org: 'o', projects: [] });

  test('same key in root project and shared folder → both added, second renamed', () => {
    const c = cfg();
    const hits = groupHits('10013', projects);
    expect(hits.map((h) => h.suggested.key)).toEqual(['10013da', '10013da']);
    const r = mergeHits(c, hits);
    expect(r.added).toEqual(['10013da', '10013da-acme-web']);
    expect(r.renamed).toEqual([{ from: '10013da', to: '10013da-acme-web' }]);
    expect(c.projects.map((p) => [p.projectId, p.folder, p.releases])).toEqual([
      ['guid-common', '10013da', [30]],
      ['guid-10013', undefined, [1]],
    ]);
  });

  test('re-adding is a no-op (dedupe by identity, not key)', () => {
    const c = cfg();
    mergeHits(c, groupHits('10013', projects));
    const r = mergeHits(c, groupHits('10013', projects));
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual(['10013da', '10013da-acme-web']);
    expect(c.projects).toHaveLength(2);
  });

  test('legacy entry (no projectId) matched by name+folder gets id filled in', () => {
    const c: Config = { org: 'o', projects: [{ key: 'ra', name: 'Common', folder: '10344RA' }] };
    const r = mergeHits(c, groupHits('10344', projects));
    expect(r.updated).toEqual(['ra']);
    expect(c.projects).toEqual([{ key: 'ra', name: 'Common', folder: '10344RA', projectId: 'guid-common' }]);
  });
});
