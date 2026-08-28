import type { ProjectData, Run } from './model.ts';

const min = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const run = (o: Partial<Run> & Pick<Run, 'id' | 'name' | 'status'>): Run => ({
  by: 'Ada Lovelace',
  queued: min(10),
  started: min(9),
  url: 'https://dev.azure.com/example',
  stages: [],
  ...o,
});

/** Snapshot for --mock; `tick` advances a simulated deploy through states. */
export function mockProjects(tick: number): ProjectData[] {
  const feStatus = tick < 3 ? 'running' : tick < 6 ? 'succeeded' : 'running';
  const prodPending = tick >= 2 && tick < 5;
  return [
    {
      key: '8903da',
      name: '8903da - Acme - Intranet',
      pipelines: [
        {
          key: '8903da:pipeline:104', kind: 'pipeline', id: 104, name: 'DEV BE Build', projectKey: '8903da', projectName: '8903da',
          latest: run({ id: 1, name: 'Build-20260828.2', status: 'succeeded', branch: 'develop', finished: min(40), started: min(48), queued: min(49) }),
          history: [run({ id: 0, name: 'Build-20260828.1', status: 'failed', branch: 'develop', finished: min(120), started: min(125), queued: min(126) })],
        },
        {
          key: '8903da:pipeline:105', kind: 'pipeline', id: 105, name: 'FE Build and Deploy', projectKey: '8903da', projectName: '8903da',
          latest: run({
            id: 2, name: 'Build-20260828.5', status: feStatus, branch: 'main', queued: min(4), started: min(3),
            finished: feStatus === 'succeeded' ? min(1) : undefined,
            stages: [
              { name: 'Build and push stage', status: 'succeeded' },
              { name: 'Dev deployment', status: 'skipped' },
              { name: 'Run Playwright Tests', status: tick < 2 ? 'running' : 'succeeded' },
              { name: 'Live deployment', status: tick < 2 ? 'notStarted' : feStatus === 'succeeded' ? 'succeeded' : 'running' },
            ],
          }),
          history: [
            run({ id: 3, name: 'Build-20260828.4', status: 'succeeded', branch: 'main', finished: min(300), started: min(310), queued: min(311) }),
            run({ id: 4, name: 'Build-20260828.3', status: 'canceled', branch: 'main', finished: min(400), started: min(405), queued: min(406) }),
          ],
        },
        {
          key: '8903da:pipeline:120', kind: 'pipeline', id: 120, name: 'MAIN BE Build', projectKey: '8903da', projectName: '8903da',
          latest: run({ id: 5, name: 'Build-20260827.9', status: 'succeeded', branch: 'main', finished: min(1500), started: min(1510), queued: min(1511) }),
          history: [],
        },
      ],
      releases: [
        {
          key: '8903da:release:2', kind: 'release', id: 2, name: '8903da main be deploy', projectKey: '8903da', projectName: '8903da',
          latest: run({
            id: 6, name: 'Release-88', status: prodPending ? 'pending-approval' : tick >= 5 ? 'succeeded' : 'running',
            queued: min(6), started: min(6), finished: tick >= 5 ? min(0) : undefined,
            stages: [
              { name: 'stage', status: tick < 2 ? 'running' : 'succeeded' },
              { name: 'production', status: prodPending ? 'pending-approval' : tick >= 5 ? 'succeeded' : 'notStarted', approvalId: prodPending ? 4242 : undefined },
            ],
          }),
          history: [run({ id: 7, name: 'Release-87', status: 'succeeded', finished: min(2000), started: min(2010), queued: min(2010), stages: [{ name: 'stage', status: 'succeeded' }, { name: 'production', status: 'succeeded' }] })],
        },
      ],
    },
    {
      key: '10013da',
      name: '10013da - Acme - Website',
      pipelines: [
        {
          key: '10013da:pipeline:140', kind: 'pipeline', id: 140, name: 'BE Build - Dev', projectKey: '10013da', projectName: '10013da',
          latest: run({ id: 8, name: 'Build-20260828.7', status: 'succeeded', branch: 'develop', finished: min(55), started: min(60), queued: min(61) }),
          history: [],
        },
        {
          key: '10013da:pipeline:158', kind: 'pipeline', id: 158, name: 'BE Build - Main', projectKey: '10013da', projectName: '10013da',
          latest: run({ id: 9, name: 'Build-20260828.3', status: 'queued', branch: 'main', queued: min(1), started: undefined }),
          history: [run({ id: 10, name: 'Build-20260828.2', status: 'partial', branch: 'main', finished: min(700), started: min(710), queued: min(711) })],
        },
        {
          key: '10013da:pipeline:159', kind: 'pipeline', id: 159, name: 'FE Build and Deploy', projectKey: '10013da', projectName: '10013da',
          latest: run({ id: 11, name: 'Build-20260827.4', status: 'succeeded', branch: 'main', finished: min(1300), started: min(1317), queued: min(1318), by: 'CI' }),
          history: [],
        },
      ],
      releases: [
        {
          key: '10013da:release:1', kind: 'release', id: 1, name: '10013da dev be deploy', projectKey: '10013da', projectName: '10013da',
          latest: run({ id: 12, name: 'Release-410', status: 'succeeded', queued: min(50), started: min(50), finished: min(45), stages: [{ name: 'dev', status: 'succeeded' }] }),
          history: [],
        },
        {
          key: '10013da:release:2', kind: 'release', id: 2, name: '10013da main be deploy', projectKey: '10013da', projectName: '10013da',
          latest: run({ id: 13, name: 'Release-303', status: 'failed', queued: min(200), started: min(200), finished: min(190), stages: [{ name: 'stage', status: 'succeeded' }, { name: 'production', status: 'failed' }] }),
          history: [run({ id: 14, name: 'Release-302', status: 'succeeded', queued: min(1600), started: min(1600), finished: min(1590), stages: [{ name: 'stage', status: 'succeeded' }, { name: 'production', status: 'succeeded' }] })],
        },
      ],
    },
  ];
}
