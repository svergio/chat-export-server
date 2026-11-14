# AGENTS.md — chat-export-server

Guidance for AI agents and humans working in this repo. Human detail: [CONTRIBUTING.md](./CONTRIBUTING.md). Sibling repos: `chat-export-extension`, `chat-export-dashboard`. Protocol lives in `packages/protocol`.

## Branch policy (hard)

```
origin/test
  └─ feature/<name>  or  fix/<name>          ← product
        └─ test/<name>  or  <feature>-tests  ← tests for THAT change
              → merge tests into feature/fix
              → merge feature/fix into long-lived test
              → release: test → main + version tag
```

### If you want to test a feature

1. Use the existing **feature** / **fix** branch (product).
2. **Create a tests branch from it** (`test/<name>` or `<feature>-tests`).
3. Put adversarial / contract / live-matrix cases on the tests branch.
4. Merge tests → feature/fix, then feature/fix → long-lived **`test`**.
5. Never “ship product to `main`, tests later”. Never open ordinary feature PRs against `main`.
6. **Cleanup:** delete short-lived `feature/*`, `fix/*`, `test/<name>` / `*-tests` after merge into long-lived `test` (local + remote). After release, delete leftovers that already landed. **Keep** long-lived `test`, `main`, and version tags.

### Commits / co-authors (Chat Export only)

**Allowed:** `Co-authored-by:` for the **AI agent** that did the work.

```
Co-authored-by: Cursor Agent <cursoragent@cursor.com>
```

Do not invent fake human co-authors. Outside Chat Export repos, co-author trailers stay forbidden.

## How to do a feature

1. Branch `feature/<name>` or `fix/<name>` from long-lived `test`.
2. Implement product change on that branch.
3. To validate: branch **tests** off the feature/fix branch; add adversarial coverage there; merge back.
4. If the change touches MCP tools or platform ops: plan / extend the **flat live run-list** (`docs/qa/mcp-run-list.json`) — do **not** invent a second matrix format.
5. Run local gates; open PR **into long-lived `test`**.
6. Release (`test` → `main` + tag) only when asked / checklist done.

Protocol / platform id changes: same lowercase id as extension content scripts and bridge. After enum/schema edits: `npm run schema`, `npm run build`, tests.

Embedded dashboard: build in sibling `chat-export-dashboard`, rsync into `dashboard/public/`, commit server copy on release paths.

## Adversarial testing (break it, without fanaticism)

Goal: expose real failures in RPC bridges, auth gates, SQLite, and MCP tool contracts — on a **tests branch rooted in the feature/fix branch**.

**Exercise:**

- Invalid/expired `ceb_` / `cem_` tokens; oversize bodies
- Destructive ops without `confirm` / paywall vs `allowPaywall` / `testOnly` semantics
- Empty `platformsEnabled` online bind → expect `PLATFORM_DISABLED` (not silent success)
- SQLite migration / idempotency edges
- Live MCP flat run-list on real browsers (see below)

**Boundaries:** no multi-minute fuzz in default CI; keep unit + contract **under ~15s** per job. Live destructive: **`[ce-test]`** chats only.

## Live MCP run-list (manual)

Unit/contract mocks are not a substitute for live coverage.

```text
docs/qa/mcp-run-list.json          # flat ordered cases
scripts/mcp-run-list.mjs           # orchestrator
docs/qa/mcp-run-list-RUN.md        # run log
docs/qa/mcp-live-matrix-RED.md     # append-only failures
docs/qa/mcp-run-state.json         # resume cursor
```

Rules from product soak:

1. Walk the list in order; case **FAIL** → append RED → **continue** (never restart the whole matrix for one RED).
2. Orchestrator crash → fix orchestrator only → `--from=N` / `--from-state`.
3. **No product edits mid-run.** Hotfixes are a separate pass over RED.
4. Selection: `--ids` > `--from`/`--to` > `--from-state` > full list.
5. Batch jobs: assert `result.ok` / `failed`, never `status=done` alone.
6. Deprecated: `scripts/mcp-live-matrix.mjs` (pointer stub).

```bash
node scripts/gen-mcp-run-list.mjs
node scripts/mcp-run-list.mjs --dry-run
export CHAT_EXPORT_MCP_TOKEN=cem_…
export CHAT_EXPORT_BROWSER_ID=b-…
node scripts/mcp-run-list.mjs
node scripts/mcp-run-list.mjs --from=042
```

See [docs/qa/mcp-live-matrix.md](./docs/qa/mcp-live-matrix.md).

## Commands

```bash
npm test
npm run test:contract
npm run test:all
npm run typecheck
npm run build
npm run schema
# when touching manifests:
kubectl kustomize deploy/k8s
```

## Failed CI / MR review

Four-part report before patches: **What broke** / **Why it broke** (cited) / **Impact** / **Fix direction**.

## Workspace rules (Cursor maintainer tree)

- `.cursor/rules/chat-export-test-branch-adversarial.mdc`
- `.cursor/rules/chat-export-provider-research.mdc`
- `.cursor/rules/chat-export-mr-review-after-tests.mdc`
- `.cursor/rules/no-git-coauthors.mdc` (agent Co-authored-by **only** in Chat Export)
