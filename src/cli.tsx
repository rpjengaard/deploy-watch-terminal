#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { parseArgs } from 'node:util';
import { App } from './ui/app.tsx';
import { loadConfig, initConfig, CONFIG_PATH, ConfigError } from './config.ts';
import { createTokenProvider } from './auth.ts';
import { AdoClient } from './ado.ts';
import { mockProjects } from './mock.ts';
import type { Source } from './ui/hooks.ts';
import { hasConfig as hasConfigFile } from './config.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    add: { type: 'boolean', default: false },
    org: { type: 'string' },
    force: { type: 'boolean', default: false },
    project: { type: 'string', short: 'p', multiple: true },
    quiet: { type: 'boolean', default: false },
    mock: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`deploy-watch — watch Azure DevOps pipelines & releases

Usage: deploy-watch [options]
       deploy-watch init --org <org> [--force]
       deploy-watch find <term> [--add] [--org <org>]

  -p, --project <key>   only watch this project key (repeatable), e.g. -p 8903da
      --quiet           no bell / macOS notifications
      --mock            render from fixture data (no network)
  -h, --help

  init --org <org>      create the config file for your Azure DevOps organisation
                        (dev.azure.com/<org>); --force overwrites an existing one
  find <term>           search all projects in the org for pipelines/releases whose
                        name, folder or project matches <term> (e.g. a job number: 10344)
      --add             append the matches to the config file
      --org <org>       search this org instead of the configured one

Config: ${CONFIG_PATH}
Auth:   AZDO_PAT env var, else \`az account get-access-token\`
Keys:   j/k move · enter expand · o open in browser · a approve · x reject · r refresh · q quit`);
  process.exit(0);
}

function fail(e: unknown): never {
  console.error(e instanceof ConfigError ? e.message : (e as Error).stack ?? String(e));
  process.exit(1);
}

if (positionals[0] === 'init') {
  try {
    initConfig(values.org ?? '', values.force);
    console.log(`Wrote ${CONFIG_PATH} for org "${values.org}".\nNext: deploy-watch find <job-number> --add`);
  } catch (e) {
    fail(e);
  }
  process.exit(0);
}

if (positionals[0] === 'find') {
  const term = positionals[1];
  if (!term) {
    console.error('Usage: deploy-watch find <term> [--add] [--org <org>]');
    process.exit(1);
  }
  let cfg;
  try {
    cfg = values.org ? { org: values.org, projects: [] } : loadConfig();
  } catch (e) {
    fail(e);
  }
  if (values.add && !hasConfigFile()) fail(new ConfigError(`--add needs a config file; run: deploy-watch init --org ${cfg.org}`));
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
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    fail(e);
  }
  if (!cfg.projects.length) {
    fail(new ConfigError(`No solutions in ${CONFIG_PATH}.\nAdd some with: deploy-watch find <job-number> --add`));
  }
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

render(<App source={source} approver={approver} quiet={values.quiet} org={org} />, {
  alternateScreen: true,
  exitOnCtrlC: true,
});
