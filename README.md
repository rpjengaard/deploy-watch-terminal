# deploy-watch

Terminal UI that watches Azure DevOps **pipelines and releases** live — across as many projects/solutions as you like — with stage progress, history, desktop notifications and one-key **approve / reject** of release stages.

```
 deploy-watch · MyOrg  0:active 2 ⏸1  1:8903da  2:10013da                    ⟳ every 5s · updated 2s ago
╭──────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ACTIVE DEPLOYS · 2 active · 1 awaiting approval                                                      │
│                                                                                                      │
│ ▸ ⏸ 8903da · main be deploy                                                  awaiting approval 6m01s │
│     Release-88 · Ada Lovelace                                                         6m ago (12:35) │
│     ✓ stage › ⏸ production                                                                           │
│   ⠸ 8903da · FE Build and Deploy                                                       running 3m01s │
│     Build-20260828.5 · main · Ada Lovelace                                            3m ago (12:38) │
│     ✓ Build and push › – Dev deployment › ✓ Playwright Tests › ● Live deployment                     │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────╯
 j/k move · h/l/tab/0-9 view · enter expand · o open · a approve · x reject · r refresh · q quit
```

## Install

Needs the [Azure CLI](https://learn.microsoft.com/cli/azure/) (`az login`) — or a PAT. The repo is private, so you need read access first (ask the owner).

**Binary** (recommended, no Bun needed) — with the [GitHub CLI](https://cli.github.com) logged in:

```sh
sudo mkdir -p /usr/local/bin/deploy-watch
gh release download -R rpjengaard/deploy-watch-terminal -p deploy-watch-darwin-arm64 -O /usr/local/bin/deploy-watch
chmod +x /usr/local/bin/deploy-watch
```

Assets: `deploy-watch-darwin-arm64` (Apple Silicon), `deploy-watch-darwin-x64` (Intel Mac), `deploy-watch-linux-x64`. Or download from the [Releases](https://github.com/rpjengaard/deploy-watch-terminal/releases) page. macOS may need `xattr -d com.apple.quarantine /usr/local/bin/deploy-watch` on first run (unsigned binary).

**From source** — needs [Bun](https://bun.sh) ≥ 1.1 and an SSH key on GitHub (`bun` cannot install private repos over HTTPS):

```sh
bun install -g git+ssh://git@github.com/rpjengaard/deploy-watch-terminal.git
```

or clone and `bun install && bun link`.

## Setup (2 commands)

```sh
deploy-watch init --org MyOrg          # dev.azure.com/MyOrg → writes ~/.config/deploy-watch/config.json
deploy-watch find 10344 --add          # search the org for a solution, add its pipelines/releases
deploy-watch                           # watch
```

`find` searches every project in the org for pipelines/releases whose **name, folder or project** contains the term (a job number, a customer name, anything) and prints a ready-to-paste config entry per project/folder:

```
Common \ 10344ra
  pipeline   213  10344ra BE Dev Build
  pipeline   214  10344ra BE Main Build
  release     24  10344ra dev be deploy
  config:   {"key":"10344ra","name":"Common","folder":"10344ra"}
```

## Usage

```
deploy-watch                          # watch all configured solutions
deploy-watch -p 8903da -p 10013da     # only these keys (repeatable)
deploy-watch --quiet                  # no bell / desktop notifications
deploy-watch --mock                   # fixture data, no network — try the UI
deploy-watch init --org <org> [--force]
deploy-watch find <term> [--add] [--org <org>]
```

| option | short | effect |
|---|---|---|
| `--project <key>` | `-p` | only watch this key; repeat for several |
| `--quiet` | | disable bell + macOS notifications |
| `--mock` | | fixture data (simulates a deploy → pending approval → done) |
| `init --org <org>` | | create the config file; `--force` overwrites |
| `find <term>` | | list matching pipelines/releases; `--add` appends to config; `--org` searches another org |
| `--help` | `-h` | usage |

| env | effect |
|---|---|
| `AZDO_PAT` | use a PAT instead of the `az` CLI token |
| `DEPLOY_WATCH_CONFIG` | config path (default `~/.config/deploy-watch/config.json`) |

## Config

`~/.config/deploy-watch/config.json`:

```json
{
  "org": "MyOrg",
  "projects": [
    { "key": "web", "name": "Customer Website" },
    { "key": "10344ra", "name": "Common", "folder": "10344ra" },
    { "key": "api", "name": "Customer API", "pipelines": [158, 159], "releases": [2] }
  ]
}
```

| field | meaning |
|---|---|
| `org` | Azure DevOps organisation (`dev.azure.com/<org>`) |
| `key` | short label you choose — used for `-p`, tab labels, notifications; must be unique |
| `name` | exact Azure DevOps project name |
| `folder` | optional: only definitions in this folder — for shared projects where each solution lives in its own folder |
| `pipelines` / `releases` | optional definition-id filters |

## Auth

Uses `az account get-access-token` (be `az login`-ed). Set `AZDO_PAT` to use a PAT instead (needs *Build: read*, *Release: read, write, execute*). On 401 the token is re-fetched once; if that fails a red banner is shown and polling continues.

## Views & keys

- `0:active` — every queued / running / awaiting-approval pipeline or release across all solutions, approvals first. The app starts here.
- `1…9` — one tab per solution; ≤2 solutions on a wide terminal are shown side by side.

| key | action |
|---|---|
| `j` / `k` / arrows | move selection |
| `enter` / `space` | expand: show last 3 runs |
| `o` | open selected run in the browser |
| `a` / `x` | approve / reject the pending stage of the selected release (`y` to confirm) |
| `r` | refresh now |
| `0` | active deploys view |
| `1`–`9` | solution tab |
| `h` / `l` / `←` / `→` / `tab` | previous / next view; side-by-side: hop between panes |
| `q` | quit |

Polls every 5s while anything is running or awaiting approval, else every 30s.
Notifies (bell + macOS notification) when a watched run finishes, fails, or a release waits for approval.

## Dev

```sh
bun test
bun run typecheck
bun run mock
bun run build          # standalone binary → dist/deploy-watch
```

Tagging `v*` builds macOS (arm64/x64) + Linux binaries and attaches them to a GitHub Release.

## License

MIT
