# deploy-watch

Terminal UI that watches Azure DevOps pipelines and releases live.

## Install

```
bun install
bun link          # exposes `deploy-watch` on PATH
```

## Start

```
deploy-watch                          # watch all configured projects
deploy-watch -p 8903da                # only one project
deploy-watch -p 8903da -p 10013da     # pick several (repeatable)
deploy-watch --quiet                  # no bell / macOS notifications
deploy-watch --mock                   # fixture data, no network — try the UI
deploy-watch --help
```

Without `bun link`: `bun run start` / `bun run mock` from this folder.

| option | short | effect |
|---|---|---|
| `--project <key>` | `-p` | only watch this project key; repeat for several. Keys come from `config.json` |
| `--quiet` | | disable bell + macOS notifications |
| `--mock` | | render from fixture data (simulates a deploy → pending approval → done) |
| `--help` | `-h` | usage |

### Find a solution by job number

```
deploy-watch find 10344          # search every project in the org
deploy-watch find 10344 --add    # …and append the matches to config.json
deploy-watch -p 10344ra          # watch it
```

Searches all projects in the org for pipelines/releases whose **name, folder or project** contains the term (case-insensitive), grouped per project/folder, each with a ready-to-paste config entry:

```
Common \ 10344ra
  pipeline   213  10344ra BE Dev Build
  pipeline   214  10344ra BE Main Build
  pipeline   223  10344ra FE Build and Deploy
  release     24  10344ra dev be deploy
  release     25  10344ra main be deploy
  config:   {"key":"10344ra","name":"Common","folder":"10344ra"}

Run again with --add to append these to ~/.config/deploy-watch/config.json
```

| command / option | effect |
|---|---|
| `find <term>` | list matches; `<term>` is usually a job number (`10344`) but any text works (`danish`, `radikale`) |
| `find <term> --add` | append every match group to `config.json`; groups whose key already exists are skipped |

Solutions in a shared project (e.g. `Common`) get a `folder`-scoped entry; standalone projects get a plain entry keyed by the project's first word.

### Environment

| variable | effect |
|---|---|
| `AZDO_PAT` | use a PAT instead of the `az` CLI token (see Auth) |
| `DEPLOY_WATCH_CONFIG` | path to config file (default `~/.config/deploy-watch/config.json`) |

## Auth

Uses `az account get-access-token` (you must be `az login`-ed). Set `AZDO_PAT` to use a PAT instead.
On 401 the token is re-fetched once; if that fails a red banner is shown and polling continues.

## Config

`~/.config/deploy-watch/config.json` — created on first run:

```json
{
  "org": "LimboDevOps",
  "projects": [
    { "key": "8903da", "name": "8903da - Danish Crown - Internal Website Solution" },
    { "key": "10013da", "name": "10013da - Danish Crown - External Web", "pipelines": [158, 159], "releases": [2] }
  ]
}
```

| field | meaning |
|---|---|
| `key` | short label you choose — used for `-p <key>`, tab labels, notifications. Must be unique |
| `name` | exact Azure DevOps project name (`az devops project list --org https://dev.azure.com/LimboDevOps -o table`) |
| `folder` | optional: only definitions in this folder of the project. For shared projects like `Common`, where each solution lives in a folder (`\10260ny`, `\10280he`, …) |
| `pipelines` / `releases` | optional definition-id filters (`az pipelines list …`, `az pipelines release definition list …`) |

Solution in the shared `Common` project:

```json
{ "key": "10260ny", "name": "Common", "folder": "10260ny" }
```


## Keys

| key | action |
|---|---|
| `j` / `k` / arrows | move selection |
| `enter` / `space` | expand: show last 3 runs |
| `o` | open selected run in browser |
| `a` / `x` | approve / reject pending stage on selected release (`y` to confirm) |
| `r` | refresh now |
| `h` / `l` / `←` / `→` / `tab` | jump to the other project pane (same row) |
| `1`–`9` | switch project tab (narrow terminal / >2 projects) |
| `q` | quit |

Polls every 5s while anything is running / awaiting approval, else every 30s.
Notifies (bell + macOS notification) when a watched run finishes, fails, or a release waits for approval.

## Dev

```
bun test
bun run typecheck
bun run mock
```
