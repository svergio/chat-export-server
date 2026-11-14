# MCP live matrix — flat run list

Live adversarial coverage for chat-export MCP. Unit/contract mocks are not a substitute.

## Model

1. **Tools × providers** → one flat JSON list of cases.
2. **Orchestrator** walks the list in order.
3. Case **FAIL** → append RED → **next case** (never restart the whole matrix).
4. **Orchestrator crash** → fix orchestrator only → `--from=N` or `--from-state`.
5. **No product edits** during a run. Hotfixes are a separate pass over RED.
6. Branch **`test`** only; do not push test matrix work to `main` until CI is green.

```text
32 tools × 11 wire platforms  →  docs/qa/mcp-run-list.json
                              →  scripts/mcp-run-list.mjs
                              →  docs/qa/mcp-run-list-RUN.md
                              →  docs/qa/mcp-live-matrix-RED.md (append-only)
                              →  docs/qa/mcp-run-state.json (resume cursor)
```

`janitorai` = one `SKIP(wire-filtered)` row (not on MCP wire).

## Commands

```bash
cd chat-export-server
node scripts/gen-mcp-run-list.mjs          # regenerate committed list
node scripts/mcp-run-list.mjs --dry-run    # print id/tool/platform
export CHAT_EXPORT_MCP_TOKEN=cem_…
export CHAT_EXPORT_BROWSER_ID=b-215c6f46
node scripts/mcp-run-list.mjs                 # full walk
node scripts/mcp-run-list.mjs --from=042      # from id to end
node scripts/mcp-run-list.mjs --from=042 --to=080   # inclusive range
node scripts/mcp-run-list.mjs --ids=4,8,12    # arbitrary set (pre-release smoke)
node scripts/mcp-run-list.mjs --ids=004,008,012
node scripts/mcp-run-list.mjs --from-state    # resume after orch crash
node scripts/mcp-run-list.mjs --only=perplexity
node scripts/mcp-run-list.mjs --only-tool=chats_delete
```

Selection priority: `--ids` > `--from`/`--to` > `--from-state` > full list.

Smoke helpers: `--fresh-state`, `--state=…`, `--run=docs/qa/mcp-run-list-RED-SMOKE.md`, `--red=…`.

Deprecated: `scripts/mcp-live-matrix.mjs` (exits 2; prints pointer here).

## Isolation during a walk

- **One MCP client** on the bound browser (the orchestrator). Do not call Cursor `chat-export` MCP tools in parallel — dual clients cause `-32001` / zombie RPC pile-up (R5/R6).
- Client `timeoutMs` for host RPC is ≥ server `rpcTimeoutMs` (+10s floor, see `gen-mcp-run-list.mjs` / `CHAT_EXPORT_RPC_TIMEOUT_MS`).
- Orchestrator clears `chatId` / `cacheId` / `containerId` on **platform change** and on failed slot-setters (no cross-provider bleed).
- Do **not** auto-SKIP auth/paywall/host errors. `softFail: unsupported` in the case JSON is only for ops the host declares unsupported (e.g. `projects_*`); everything else stays FAIL → RED.

## Case shape

See `mcp-run-list.json`. Slots: `{{chatId}}`, `{{cacheId}}`, `{{containerId}}`, `{{lastJobId}}`, filled from earlier creates/syncs on the same platform. Destructive cases use `[ce-test]` titles / `confirm:true`.

Batch jobs: assert `result.ok` / `failed`, never `status=done` alone.

## Traps (in list)

| Id tool | Intent |
|---------|--------|
| `__trap_T5_schema_testOnly` | MCP `testOnly` describe ≠ dry-run |
| `__trap_T1_empty_platforms` | online empty `platformsEnabled` → `PLATFORM_DISABLED` |
| `__trap_T2_testOnly_default` | non-`[ce-test]` delete_batch → safety or paywall RED |

## Platforms

`chatgpt`, `grok`, `grok-x`, `copilot`, `claude`, `qwen`, `deepseek`, `perplexity`, `kimi`, `zai`, `minimax`
