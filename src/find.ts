// [CHANGE: unique project identity] Related: src/config.ts, src/ado.ts, src/model.ts, src/mock.ts, src/ui/app.tsx, src/cli.tsx
import { readFileSync, writeFileSync } from 'node:fs';
import type { AdoClient, DefSummary } from './ado.ts';
import { CONFIG_PATH, identityOf, type Config, type ProjectConfig } from './config.ts';

export interface Hit {
  project: string;
  projectId: string;
  folder?: string; // undefined = root of project
  pipelines: DefSummary[];
  releases: DefSummary[];
  suggested: ProjectConfig;
}

const norm = (s: string) => s.toLowerCase();
const folderOf = (path: string) => path.replace(/^[\\/]+|[\\/]+$/g, '').split(/[\\/]/)[0] || undefined;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Group matching definitions by (project, top-level folder). Pure; testable. */
export function groupHits(
  term: string,
  projects: { id: string; name: string; pipelines: DefSummary[]; releases: DefSummary[] }[],
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
        const suggested: ProjectConfig = { key, projectId: p.id, name: p.name, ...(folder ? { folder } : {}) };
        h = { project: p.name, projectId: p.id, folder, pipelines: [], releases: [], suggested };
        groups.set(gk, h);
      }
      h[kind].push(d);
    };
    p.pipelines.forEach((d) => add('pipelines', d));
    p.releases.forEach((d) => add('releases', d));
    for (const h of groups.values()) {
      // pin exactly what matched, so a root-level entry doesn't pull in every other folder of the project
      h.suggested.pipelines = h.pipelines.map((d) => d.id);
      h.suggested.releases = h.releases.map((d) => d.id);
      hits.push(h);
    }
  }
  return hits;
}

export async function find(client: AdoClient, term: string): Promise<Hit[]> {
  const projects = await client.listProjects();
  const all = await Promise.all(
    projects.map(async (p) => {
      try {
        return { id: p.id, name: p.name, ...(await client.listDefinitions(p.name)) };
      } catch {
        return { id: p.id, name: p.name, pipelines: [], releases: [] };
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

export interface AddResult {
  added: string[]; // keys of new entries
  renamed: { from: string; to: string }[]; // suggested key was taken by another project/folder
  updated: string[]; // existing entries (matched by name+folder) that got their projectId filled in
  skipped: string[]; // keys of entries already watching that project/folder
}

/** Pure merge of hits into a config; dedupes by project identity, not key. */
export function mergeHits(cfg: Config, hits: Hit[]): AddResult {
  const res: AddResult = { added: [], renamed: [], updated: [], skipped: [] };
  const keys = new Set(cfg.projects.map((p) => p.key));
  for (const h of hits) {
    const s = h.suggested;
    const id = identityOf(s);
    const existing =
      cfg.projects.find((p) => identityOf(p) === id) ??
      // legacy entry without projectId: same name + folder is the same thing
      cfg.projects.find((p) => !p.projectId && identityOf(p) === identityOf({ name: s.name, folder: s.folder }));
    if (existing) {
      if (!existing.projectId) {
        existing.projectId = s.projectId;
        res.updated.push(existing.key);
      } else res.skipped.push(existing.key);
      continue;
    }
    let key = s.key;
    if (keys.has(key)) {
      key = `${s.key}-${slug(h.folder ? h.project : h.project.split(/\s+/).slice(1).join(' ') || 'root')}`;
      for (let n = 2; keys.has(key); n++) key = `${s.key}-${n}`;
      res.renamed.push({ from: s.key, to: key });
    }
    keys.add(key);
    cfg.projects.push({ ...s, key });
    res.added.push(key);
  }
  return res;
}

/** Append hits to the config file. */
export function addToConfig(hits: Hit[], path = CONFIG_PATH): AddResult {
  const cfg = JSON.parse(readFileSync(path, 'utf8')) as Config;
  const res = mergeHits(cfg, hits);
  if (res.added.length || res.updated.length) writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return res;
}
