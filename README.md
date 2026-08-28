# deploy-watch

Terminal UI that watches Azure DevOps pipelines and releases live.

```
bun install
bun link          # exposes `deploy-watch` on PATH
deploy-watch                 # all configured projects
deploy-watch -p 8903da       # one project
deploy-watch --quiet         # no bell / macOS notifications
deploy-watch --mock          # fixture data, no network
```

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
| `tab`, `1`–`9`, `h`/`l` | switch project (narrow terminal / >2 projects) |
| `q` | quit |

Polls every 5s while anything is running / awaiting approval, else every 30s.
Notifies (bell + macOS notification) when a watched run finishes, fails, or a release waits for approval.

## Dev

```
bun test
bun run typecheck
bun run mock
```
