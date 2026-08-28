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

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    add: { type: 'boolean', default: false },
    project: { type: 'string', short: 'p', multiple: true },
    quiet: { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`deploy-watch — watch Azure DevOps pipelines & releases

Usage: deploy-watch [options]
       deploy-watch find <term> [--add]

  -p, --project <key>   only watch this project key (repeatable), e.g. -p 8903da
      --quiet           no bell / macOS notifications
      --mock            render from fixture data (no network)
  -h, --help

  find <term>           search all projects in the org for pipelines/releases whose
                        name, folder or project matches <term> (e.g. a job number: 10344)
      --add             append the matches to the config file

Config: ${CONFIG_PATH}
Auth:   AZDO_PAT env var, else \`az account get-access-token\`
Keys:   j/k move · enter expand · o open in browser · a approve · x reject · r refresh · q quit`);
  process.exit(0);
}

if (positionals[0] === 'find') {
  const term = positionals[1];
  if (!term) {
    console.error('Usage: deploy-watch find <term> [--add]');
    process.exit(1);
  }
  const cfg = loadConfig();
  const client = new AdoClient(cfg, createTokenProvider());
  const { find, formatHits, addToConfig } = await import('./find.ts');
  const hits = await find(client, term);
  console.log(formatHits(term, hits));
  if (values.add && hits.length) {
    const added = addToConfig(hits);
    console.log(added.length ? `Added to ${CONFIG_PATH}: ${added.join(', ')}` : `Nothing added — keys already in ${CONFIG_PATH}`);
  } else if (hits.length) {
    console.log(`Run again with --add to append these to ${CONFIG_PATH}`);
  }
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
