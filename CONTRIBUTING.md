# Contributing to chat-export-server

Local MCP gateway for the [Chat Export](https://github.com/svergio/chat-export-extension) Chrome extension. Pair this repo with `chat-export-extension` (browser bridge) and `chat-export-dashboard` (embedded UI under `dashboard/`).

Do not add `Co-authored-by` trailers to commits. Target `main` for feature fixes; use branch `test` when you are landing adversarial or contract tests before promotion.

Related: extension [CONTRIBUTING.md](https://github.com/svergio/chat-export-extension/blob/main/CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## Prerequisites

- **Node.js** 22.13+ (`engines` in `package.json`)
- **npm** workspaces (`packages/protocol`)
- Optional: **Docker** / Colima, **kubectl** for `deploy/k8s/` when present

## Build and typecheck

```bash
npm ci
npm run build          # tsc -> dist/
npm run typecheck      # tsc --noEmit
npm run schema         # JSON Schema via @chat-export/protocol workspace
```

After protocol enum or op changes, rebuild and run tests before opening a PR.

## Tests (`test` branch gate)

CI runs on pushes and PRs to **`test`** and **`main`** (see `.github/workflows/ci.yml`).

```bash
npm test               # node --test test/unit/*.test.js
```

Prefer adding adversarial cases on branch `test` first (malformed bodies, bad tokens, destructive ops without confirm, path traversal in export names, migration edges). Keep suites deterministic and under ~15s per job.

Merge `test` into `main` only when CI is green on `test`.

## Protocol package

| Task | Command / path |
|------|----------------|
| Platform ids | `packages/protocol/src/constants.js` (`PLATFORMS`) |
| RPC validation | `packages/protocol/src/schema.js` |
| Fixtures | `packages/protocol/fixtures/` |
| Regenerate schema artifacts | `npm run schema` |

Extension content scripts and MCP tools must use the same platform id strings.

## Embedded dashboard

Built static files are served from `dashboard/public/`. After changes in the sibling `chat-export-dashboard` repo:

```bash
cd ../chat-export-dashboard
npm ci && npm run build
rsync -a --delete public/ ../chat-export-server/dashboard/public/
```

Commit the submodule / copied assets in the server repo when you ship a dashboard release.

## Docker and Kubernetes

| Stack | Path |
|-------|------|
| Compose | `docker-compose.yml` |
| OCI image | `Dockerfile` |
| K8s manifests | `deploy/k8s/` (`kubectl apply -k deploy/k8s`) when shipped |
| Release images | `.github/workflows/publish-oci.yml` on GitHub Release tags |

When `deploy/k8s/` exists, CI runs `kubectl kustomize deploy/k8s` as a sanity check.

## Configuration and MCP

- Default bind: loopback (`127.0.0.1`); see README **Configuration**
- Tokens: `cem_` (MCP), `ceb_` (browser bridge)
- Streamable HTTP MCP: `/mcp`

## PR hygiene

- On failed CI or MR review, maintainer workspace rule `.cursor/rules/chat-export-mr-review-after-tests.mdc` defines the required four-part report (what/why/impact/fix).
- One logical change per PR when possible
- No secrets in commits (`config.json`, tokens, real `ceb_` / `cem_` values)
- Update README if user-facing risk or deployment behavior changes
- Link related extension or dashboard PRs in the description

Questions: [GitHub Issues](https://github.com/svergio/chat-export-server/issues).
