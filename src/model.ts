export type Status =
  | 'queued'
  | 'running'
  | 'pending-approval'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'notStarted'
  | 'unknown';

export interface Stage {
  name: string;
  status: Status;
  approvalId?: number;
}

export interface Run {
  id: number;
  name: string; // buildNumber or release name
  status: Status;
  branch?: string;
  by: string;
  queued: string; // ISO
  started?: string;
  finished?: string;
  url: string;
  stages: Stage[];
}

export type TrackKind = 'pipeline' | 'release';

export interface Track {
  key: string; // `${projectKey}:${kind}:${id}`
  kind: TrackKind;
  id: number;
  name: string;
  projectKey: string;
  projectName: string;
  latest?: Run;
  history: Run[]; // completed runs after latest, newest first
}

export interface ProjectData {
  key: string;
  name: string;
  pipelines: Track[];
  releases: Track[];
  error?: string;
}

export const ACTIVE: ReadonlySet<Status> = new Set(['queued', 'running', 'pending-approval']);
export const isActive = (s: Status) => ACTIVE.has(s);

export const anyActive = (projects: ProjectData[]) =>
  projects.some((p) =>
    [...p.pipelines, ...p.releases].some((t) => t.latest && isActive(t.latest.status)),
  );

export const allTracks = (projects: ProjectData[]): Track[] =>
  projects.flatMap((p) => [...p.pipelines, ...p.releases]);

/** Map Azure DevOps build status/result to Status. */
export function buildStatus(status?: string, result?: string): Status {
  switch (status) {
    case 'notStarted':
    case 'postponed':
      return 'queued';
    case 'inProgress':
    case 'cancelling':
      return 'running';
    case 'completed':
      break;
    default:
      return 'unknown';
  }
  switch (result) {
    case 'succeeded':
      return 'succeeded';
    case 'partiallySucceeded':
      return 'partial';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return 'unknown';
  }
}

/** Map timeline record state/result to Status. */
export function timelineStatus(state?: string, result?: string): Status {
  switch (state) {
    case 'pending':
      return 'notStarted';
    case 'inProgress':
      return 'running';
    case 'completed':
      break;
    default:
      return 'notStarted';
  }
  switch (result) {
    case 'succeeded':
      return 'succeeded';
    case 'succeededWithIssues':
      return 'partial';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    case 'skipped':
    case 'abandoned':
      return 'skipped';
    default:
      return 'unknown';
  }
}

/** Map release environment status to Status. */
export function envStatus(status?: string, hasPendingApproval = false): Status {
  if (hasPendingApproval) return 'pending-approval';
  switch (status) {
    case 'notStarted':
      return 'notStarted';
    case 'queued':
    case 'scheduled':
      return 'queued';
    case 'inProgress':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'partiallySucceeded':
      return 'partial';
    case 'rejected':
      return 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return 'unknown';
  }
}

/** Derive an overall release status from its stages. */
export function releaseStatus(stages: Stage[]): Status {
  const s = stages.map((x) => x.status);
  if (s.includes('pending-approval')) return 'pending-approval';
  if (s.includes('running')) return 'running';
  if (s.includes('queued')) return 'queued';
  if (s.includes('failed')) return 'failed';
  if (s.includes('canceled')) return 'canceled';
  if (s.includes('partial')) return 'partial';
  const done = s.filter((x) => x !== 'notStarted' && x !== 'skipped');
  if (done.length && done.every((x) => x === 'succeeded')) return 'succeeded';
  if (!done.length) return 'notStarted';
  return 'unknown';
}

const ACTIVE_ORDER: Record<string, number> = { 'pending-approval': 0, running: 1, queued: 2 };

/** Every track whose latest run is active, approvals first, then oldest-started first. */
export function activeTracks(projects: ProjectData[]): Track[] {
  return allTracks(projects)
    .filter((t) => t.latest && isActive(t.latest.status))
    .sort((a, b) => {
      const d = (ACTIVE_ORDER[a.latest!.status] ?? 9) - (ACTIVE_ORDER[b.latest!.status] ?? 9);
      if (d) return d;
      return Date.parse(a.latest!.started ?? a.latest!.queued) - Date.parse(b.latest!.started ?? b.latest!.queued);
    });
}
