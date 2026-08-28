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

Env: `AZDO_PAT` — use a PAT instead of `az` token (see Auth).

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

`pipelines` / `releases` are optional definition-id filters; omit to show all.

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
