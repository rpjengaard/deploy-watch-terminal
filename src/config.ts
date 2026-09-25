import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ProjectConfig {
  key: string;
  name: string; // exact Azure DevOps project name (display + web links)
  projectId?: string; // [CHANGE: unique project identity] Related: src/find.ts, src/ado.ts, src/model.ts, src/mock.ts, src/ui/app.tsx, src/cli.tsx — ADO project GUID; used for API calls when set (survives renames)
  folder?: string; // only definitions in this folder (e.g. "10260ny" for "\\10260ny"); omit = all folders
  pipelines?: number[]; // filter by definition id; omit = all
  releases?: number[];
}

export interface Config {
  org: string; // Azure DevOps organisation, i.e. dev.azure.com/<org>
  projects: ProjectConfig[];
}

export const CONFIG_DIR = join(homedir(), '.config', 'deploy-watch');
export const CONFIG_PATH = process.env.DEPLOY_WATCH_CONFIG ?? join(CONFIG_DIR, 'config.json');

/** Unique identity of an entry: project (id, else name) + folder. Two entries with the same identity watch the same thing. */
export const identityOf = (p: Pick<ProjectConfig, 'name' | 'projectId' | 'folder'>) =>
  `${(p.projectId ?? p.name).toLowerCase()}|${(p.folder ?? '').replace(/^[\\/]+|[\\/]+$/g, '').toLowerCase()}`;

export class ConfigError extends Error {}

export const hasConfig = () => existsSync(CONFIG_PATH);

/** Write a fresh config for `org`. Refuses to overwrite unless `force`. */
export function initConfig(org: string, force = false): Config {
  if (!org) throw new ConfigError('Organisation name is required, e.g. `deploy-watch init --org MyOrg`');
  if (hasConfig() && !force) throw new ConfigError(`${CONFIG_PATH} already exists (use --force to overwrite)`);
  const cfg: Config = { org, projects: [] };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

export function loadConfig(): Config {
  if (!hasConfig()) {
    throw new ConfigError(
      `No config at ${CONFIG_PATH}.\n` +
        `Create one with:  deploy-watch init --org <your-azure-devops-org>\n` +
        `then add solutions: deploy-watch find <job-number> --add`,
    );
  }
  let cfg: Config;
  try {
    cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Config;
  } catch (e) {
    throw new ConfigError(`Cannot parse ${CONFIG_PATH}: ${(e as Error).message}`);
  }
  if (!cfg.org || !Array.isArray(cfg.projects)) throw new ConfigError(`Invalid config at ${CONFIG_PATH}: needs "org" and "projects"`);
  const keys = new Set<string>();
  const ids = new Map<string, string>(); // identity -> key
  for (const p of cfg.projects) {
    if (!p.key || !p.name) throw new ConfigError(`Project entries need "key" and "name" (${CONFIG_PATH})`);
    if (keys.has(p.key)) throw new ConfigError(`Duplicate project key "${p.key}" in ${CONFIG_PATH}`);
    keys.add(p.key);
    const id = identityOf(p);
    if (ids.has(id)) throw new ConfigError(`"${p.key}" and "${ids.get(id)}" watch the same project/folder in ${CONFIG_PATH}`);
    ids.set(id, p.key);
  }
  return cfg;
}
