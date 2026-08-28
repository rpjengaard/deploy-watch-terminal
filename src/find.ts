import { readFileSync, writeFileSync } from 'node:fs';
import type { AdoClient, DefSummary } from './ado.ts';
import { CONFIG_PATH, type Config, type ProjectConfig } from './config.ts';

export interface Hit {
  project: string;
  folder?: string; // undefined = root of project
  pipelines: DefSummary[];
  releases: DefSummary[];
  suggested: ProjectConfig;
}

const norm = (s: string) => s.toLowerCase();
const folderOf = (path: string) => path.replace(/^[\\/]+|[\\/]+$/g, '').split(/[\\/]/)[0] || undefined;

/** Group matching definitions by (project, top-level folder). Pure; testable. */
export function groupHits(
  term: string,
  projects: { name: string; pipelines: DefSummary[]; releases: DefSummary[] }[],
): Hit[] {
  const t = norm(term);
  const hits: Hit[] = [];
  for (const p of projects) {
    const projectMatches = norm(p.name).includes(t);
    const groups = new Map<string, Hit>();
    const add = (kind: 'pipelines' | 'releases', d: DefSummary) => {
      const folder = folderOf(d.path);
      if (!projectMatches && !norm(d.name).includes(t) && !(folder && norm(folder).includes(t))) return;
      const gk = folder ?? '';
      let h = groups.get(gk);
      if (!h) {
        const key = folder ?? p.name.split(/\s+/)[0]!;
        const hit: Hit = { project: p.name, folder, pipelines: [], releases: [], suggested: folder ? { key, name: p.name, folder } : { key, name: p.name } };
        groups.set(gk, hit);
        h = hit;
      }
      h[kind].push(d);
    };
    p.pipelines.forEach((d) => add('pipelines', d));
    p.releases.forEach((d) => add('releases', d));
    hits.push(...groups.values());
  }
  return hits;
}

export async function find(client: AdoClient, term: string): Promise<Hit[]> {
  const projects = await client.listProjects();
  const all = await Promise.all(
    projects.map(async (p) => {
      try {
        return { name: p.name, ...(await client.listDefinitions(p.name)) };
      } catch {
        return { name: p.name, pipelines: [], releases: [] };
      }
    }),
  );
  return groupHits(term, all);
}

export function formatHits(term: string, hits: Hit[]): string {
  if (!hits.length) return `No pipelines or releases matching "${term}".`;
  const lines: string[] = [];
  for (const h of hits) {
    lines.push(`${h.project}${h.folder ? ` \\ ${h.folder}` : ''}`);
    for (const d of h.pipelines) lines.push(`  pipeline  ${String(d.id).padStart(4)}  ${d.name}`);
    for (const d of h.releases) lines.push(`  release   ${String(d.id).padStart(4)}  ${d.name}`);
    lines.push(`  config:   ${JSON.stringify(h.suggested)}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** Append hits to the config file; returns keys added (skips keys already present). */
export function addToConfig(hits: Hit[], path = CONFIG_PATH): string[] {
  const cfg = JSON.parse(readFileSync(path, 'utf8')) as Config;
  const added: string[] = [];
  for (const h of hits) {
    if (cfg.projects.some((p) => p.key === h.suggested.key)) continue;
    cfg.projects.push(h.suggested);
    added.push(h.suggested.key);
  }
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return added;
}
