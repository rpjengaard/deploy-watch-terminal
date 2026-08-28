import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ProjectConfig {
  key: string;
  name: string;
  pipelines?: number[]; // filter by definition id; omit = all
  releases?: number[];
}

export interface Config {
  org: string; // e.g. "LimboDevOps"
  projects: ProjectConfig[];
}

export const CONFIG_DIR = join(homedir(), '.config', 'deploy-watch');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export const DEFAULT_CONFIG: Config = {
  org: 'LimboDevOps',
  projects: [
    { key: '8903da', name: '8903da - Danish Crown - Internal Website Solution' },
    { key: '10013da', name: '10013da - Danish Crown - External Web' },
  ],
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    return DEFAULT_CONFIG;
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Config;
  if (!cfg.org || !Array.isArray(cfg.projects)) throw new Error(`Invalid config at ${CONFIG_PATH}`);
  return cfg;
}
