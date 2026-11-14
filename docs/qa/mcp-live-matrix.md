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
node scripts/mcp-run-list.mjs             # full walk
node scripts/mcp-run-list.mjs --from=042  # resume from case id
node scripts/mcp-run-list.mjs --from-state
node scripts/mcp-run-list.mjs --only=perplexity
node scripts/mcp-run-list.mjs --only-tool=chats_delete
```

Deprecated: `scripts/mcp-live-matrix.mjs` (exits 2; prints pointer here).

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
