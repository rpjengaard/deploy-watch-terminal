#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { parseArgs } from 'node:util';
import { App } from './ui/app.tsx';
import { loadConfig, CONFIG_PATH, DEFAULT_CONFIG } from './config.ts';
import { createTokenProvider } from './auth.ts';
import { AdoClient } from './ado.ts';
import { mockProjects } from './mock.ts';
import type { Source } from './ui/hooks.ts';

const { values } = parseArgs({
  options: {
    project: { type: 'string', short: 'p', multiple: true },
    quiet: { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`deploy-watch — watch Azure DevOps pipelines & releases

Usage: deploy-watch [options]
  -p, --project <key>   only watch this project key (repeatable), e.g. -p 8903da
      --quiet           no bell / macOS notifications
      --mock            render from fixture data (no network)
  -h, --help

Config: ${CONFIG_PATH}
Auth:   AZDO_PAT env var, else \`az account get-access-token\`
Keys:   j/k move · enter expand · o open in browser · a approve · x reject · r refresh · q quit`);
  process.exit(0);
}

let source: Source;
let approver: AdoClient | undefined;
let org: string;

if (values.mock) {
  let tick = 0;
  org = 'mock';
  source = { fetchAll: async () => mockProjects(tick++) };
} else {
  const cfg = loadConfig();
  const filter = values.project;
  const projects = filter?.length ? cfg.projects.filter((p) => filter.includes(p.key)) : cfg.projects;
  if (!projects.length) {
    console.error(`No projects match ${filter?.join(', ')}. Known: ${cfg.projects.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }
  org = cfg.org;
  const client = new AdoClient({ ...cfg, projects }, createTokenProvider());
  source = client;
  approver = client;
}

void DEFAULT_CONFIG;

render(<App source={source} approver={approver} quiet={values.quiet} org={org} />, {
  alternateScreen: true,
  exitOnCtrlC: true,
});
