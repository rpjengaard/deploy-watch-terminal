import type { Config, ProjectConfig } from './config.ts';
import { AuthError, type TokenProvider } from './auth.ts';
import {
  buildStatus,
  envStatus,
  releaseStatus,
  timelineStatus,
  type ProjectData,
  type Run,
  type Stage,
  type Track,
} from './model.ts';

const API = 'api-version=7.1';
const HISTORY = 3; // completed runs shown after latest

export interface DefSummary {
  id: number;
  name: string;
  path: string;
}

export interface Approver {
  approve(projectName: string, approvalId: number): Promise<void>;
  reject(projectName: string, approvalId: number): Promise<void>;
}

export class AdoClient implements Approver {
  constructor(
    private cfg: Config,
    private tokens: TokenProvider,
  ) {}

  private base = (host: 'dev' | 'vsrm', project: string) =>
    `https://${host === 'dev' ? 'dev.azure.com' : 'vsrm.dev.azure.com'}/${this.cfg.org}/${encodeURIComponent(project)}/_apis`;

  private async request<T>(url: string, init: RequestInit = {}, retry = true): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: await this.tokens.header(), Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 203) {
      // 203 = ADO redirecting to sign-in page (expired/invalid token)
      this.tokens.invalidate();
      if (retry) return this.request<T>(url, init, false);
      throw new AuthError('Unauthorized (401). Run `az login` or check AZDO_PAT.');
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return (await res.json()) as T;
  }

  async fetchAll(): Promise<ProjectData[]> {
    return Promise.all(
      this.cfg.projects.map(async (p) => {
        try {
          const [pipelines, releases] = await Promise.all([this.fetchPipelines(p), this.fetchReleases(p)]);
          return { key: p.key, name: displayProject(p), pipelines, releases };
        } catch (e) {
          if (e instanceof AuthError) throw e;
          return { key: p.key, name: displayProject(p), pipelines: [], releases: [], error: (e as Error).message };
        }
      }),
    );
  }

  // ---------- discovery (used by `find`) ----------

  async listProjects(): Promise<{ id: string; name: string }[]> {
    const r = await this.request<{ value: any[] }>(`https://dev.azure.com/${this.cfg.org}/_apis/projects?$top=500&${API}`);
    return r.value.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listDefinitions(projectName: string): Promise<{ pipelines: DefSummary[]; releases: DefSummary[] }> {
    const [b, r] = await Promise.all([
      this.request<{ value: any[] }>(`${this.base('dev', projectName)}/build/definitions?${API}`),
      this.request<{ value: any[] }>(`${this.base('vsrm', projectName)}/release/definitions?${API}`).catch(() => ({ value: [] })),
    ]);
    const map = (d: any): DefSummary => ({ id: d.id, name: d.name, path: d.path ?? '\\' });
    return { pipelines: b.value.map(map), releases: r.value.map(map) };
  }

  // ---------- pipelines (build API) ----------

  private async fetchPipelines(p: ProjectConfig): Promise<Track[]> {
    const b = this.base('dev', p.name);
    const defs = (await this.request<{ value: any[] }>(`${b}/build/definitions?${API}`)).value
      .filter((d) => inFolder(d.path, p.folder))
      .filter((d) => !p.pipelines || p.pipelines.includes(d.id))
      .sort((a, b) => a.id - b.id);
    if (!defs.length) return [];
    const ids = defs.map((d) => d.id).join(',');
    const builds = (
      await this.request<{ value: any[] }>(
        `${b}/build/builds?definitions=${ids}&maxBuildsPerDefinition=${HISTORY + 1}&queryOrder=queueTimeDescending&${API}`,
      )
    ).value;

    const webBase = `https://dev.azure.com/${this.cfg.org}/${encodeURIComponent(p.name)}`;
    const runsByDef = new Map<number, Run[]>();
    for (const bld of builds) {
      const run: Run = {
        id: bld.id,
        name: bld.buildNumber,
        status: buildStatus(bld.status, bld.result),
        branch: shortBranch(bld.sourceBranch),
        by: displayName(bld.requestedFor?.displayName ?? bld.requestedBy?.displayName),
        queued: bld.queueTime,
        started: bld.startTime,
        finished: bld.finishTime,
        url: `${webBase}/_build/results?buildId=${bld.id}`,
        stages: [],
      };
      const list = runsByDef.get(bld.definition.id) ?? [];
      list.push(run);
      runsByDef.set(bld.definition.id, list);
    }
    // stages for in-progress builds
    await Promise.all(
      [...runsByDef.values()]
        .map((r) => r[0])
        .filter((r): r is Run => !!r && (r.status === 'running' || r.status === 'queued'))
        .map(async (r) => {
          r.stages = await this.fetchStages(b, r.id);
        }),
    );
    return defs.map((d) => {
      const runs = (runsByDef.get(d.id) ?? []).sort((a, b) => Date.parse(b.queued) - Date.parse(a.queued));
      return {
        key: `${p.key}:pipeline:${d.id}`,
        kind: 'pipeline',
        id: d.id,
        name: d.name,
        projectKey: p.key,
        projectName: p.name,
        latest: runs[0],
        history: runs.slice(1, HISTORY + 1),
      };
    });
  }

  private async fetchStages(b: string, buildId: number): Promise<Stage[]> {
    try {
      const tl = await this.request<{ records: any[] }>(`${b}/build/builds/${buildId}/timeline?${API}`);
      return (tl.records ?? [])
        .filter((r) => r.type === 'Stage')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((r) => ({ name: r.name, status: timelineStatus(r.state, r.result) }));
    } catch {
      return [];
    }
  }

  // ---------- releases (vsrm API) ----------

  private async fetchReleases(p: ProjectConfig): Promise<Track[]> {
    const b = this.base('vsrm', p.name);
    const [defs, approvals] = await Promise.all([
      this.request<{ value: any[] }>(`${b}/release/definitions?${API}`).then((r) =>
        r.value
          .filter((d) => inFolder(d.path, p.folder))
          .filter((d) => !p.releases || p.releases.includes(d.id))
          .sort((a, b) => a.id - b.id),
      ),
      this.request<{ value: any[] }>(`${b}/release/approvals?statuses=pending&${API}`).then((r) => r.value),
    ]);
    const pendingByEnv = new Map<number, number>(); // releaseEnvironment.id -> approval id
    for (const a of approvals) if (a.releaseEnvironment?.id) pendingByEnv.set(a.releaseEnvironment.id, a.id);

    const webBase = `https://dev.azure.com/${this.cfg.org}/${encodeURIComponent(p.name)}`;
    return Promise.all(
      defs.map(async (d): Promise<Track> => {
        const rels = (
          await this.request<{ value: any[] }>(
            `${b}/release/releases?definitionId=${d.id}&$top=${HISTORY + 1}&$expand=environments&queryOrder=descending&${API}`,
          )
        ).value;
        const runs: Run[] = rels.map((r) => {
          const stages: Stage[] = (r.environments ?? [])
            .sort((a: any, b: any) => a.rank - b.rank)
            .map((e: any) => ({
              name: e.name,
              status: envStatus(e.status, pendingByEnv.has(e.id)),
              approvalId: pendingByEnv.get(e.id),
            }));
          const stepTimes: string[] = (r.environments ?? [])
            .flatMap((e: any) => e.deploySteps ?? [])
            .map((s: any) => s.lastModifiedOn)
            .filter(Boolean)
            .sort();
          const status = releaseStatus(stages);
          const active = status === 'running' || status === 'pending-approval' || status === 'queued';
          return {
            id: r.id,
            name: r.name,
            status,
            by: displayName(r.createdFor?.displayName ?? r.createdBy?.displayName),
            queued: r.createdOn,
            started: r.createdOn,
            finished: active ? undefined : (stepTimes.at(-1) ?? r.modifiedOn),
            url: `${webBase}/_releaseProgress?releaseId=${r.id}&_a=release-pipeline-progress`,
            stages,
          };
        });
        return {
          key: `${p.key}:release:${d.id}`,
          kind: 'release',
          id: d.id,
          name: d.name,
          projectKey: p.key,
          projectName: p.name,
          latest: runs[0],
          history: runs.slice(1, HISTORY + 1),
        };
      }),
    );
  }

  private async patchApproval(projectName: string, approvalId: number, status: 'approved' | 'rejected') {
    await this.request(`${this.base('vsrm', projectName)}/release/approvals/${approvalId}?${API}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, comments: 'via deploy-watch' }),
    });
  }
  approve = (projectName: string, id: number) => this.patchApproval(projectName, id, 'approved');
  reject = (projectName: string, id: number) => this.patchApproval(projectName, id, 'rejected');
}

export function shortBranch(ref?: string): string | undefined {
  if (!ref) return undefined;
  return ref.replace(/^refs\/(heads|tags)\//, '');
}

/** Shorten service identities like "Microsoft.VisualStudio.Services.TFS" to "CI". */
export function displayName(name?: string): string {
  if (!name) return '';
  if (/^Microsoft\.VisualStudio\.Services/.test(name)) return 'CI';
  return name;
}

/** ADO definition paths look like "\\10260ny" or "\\10260ny\\sub"; match folder (case-insensitive) or any subfolder. */
export function inFolder(path: string | undefined, folder?: string): boolean {
  if (!folder) return true;
  const norm = (s: string) => s.replace(/^[\\/]+|[\\/]+$/g, '').toLowerCase();
  const want = norm(folder);
  const have = norm(path ?? '');
  return have === want || have.startsWith(want + '\\') || have.startsWith(want + '/');
}

export function displayProject(p: ProjectConfig): string {
  return p.folder ? `${p.name} \\ ${p.folder}` : p.name;
}
