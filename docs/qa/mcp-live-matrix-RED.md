# MCP live matrix RED

Updated: 2026-11-14 (RED smoke after orch/protocol fixes)

## RED smoke (2026-11-14T10:01Z) — `docs/qa/mcp-run-list-RED-SMOKE.md`

Curated `--ids` (30): **PASS 18 / SKIP 1 / FAIL 11**. Zero `-32001`.

Closed by this pass:

- R5/R6 system: client timeout ≥ `rpcTimeoutMs`; platform slot clear; no cross-provider `chatId` bleed
- `projects_create` oneOf: protocol accepts `OPTION_NOT_FOUND`; orch softFail → `SKIP(unsupported:OPTION_NOT_FOUND)` on grok-x (`100`)
- Stale `browsers_list` `online` without live WS (bind after restart)

Still open after smoke (product/env, not orch):

| Id | Signal | Bucket |
|----|--------|--------|
| 086 | grok-x `chat_read` NOT_FOUND right after PASS create | host GQL lag / id — retry landed in `content/grok-x.js` (needs **unpacked ext reload** + tab refresh) |
| 115/134 | copilot UNAUTHORIZED login | ENV |
| 183/285/319 | qwen/kimi/zai `chatId timeout` | host |
| 217 | deepseek tab navigated away on create | host |
| 251 | perplexity RATE_LIMIT Pro | ENV |
| 353 | minimax UNAUTHORIZED | ENV |
| 122/310 | missing slots after failed create | expected (slot hygiene) |

## Fixed in tree (not released)

### T5 — MCP schema lie (`testOnly`) — FIXED

- Was: describe «validate only without mutating»
- Now: default true = only `[ce-test]` titles, still mutates; `false` = any title; not a dry-run
- Files: `src/mcp/tools.ts`

### T3 — false paywall blocks delete — FIXED

- Was: `gateBeforeMutate` (no allowPaywall) → `done ok:0 failed:N` RATE_LIMIT under marketing banner
- Now: `gateBeforeDelete` uses `allowPaywall: true` (same as export)
- Contract: `delete_batch: kind=paywall host_state does not block delete`
- Files: `src/core/jobs/runners.ts`, `test/contract/jobs.test.js`
- Needs: server restart/reload for live MCP to pick up dist

## Open

### R3 — Extension context invalidated (ChatGPT) — HARDENED (needs ext reload + tab refresh)

- Was: uncaught `Extension context invalidated` on chatgpt.com; stale content script after SW recycle
- Change: `runtimeAlive()` try/catch; safe boot/rpc/platformGate/storage listeners; no throw on dead runtime
- Files: `chat-export-extension/src/core.js`, `boot.js`, `rpc.js`, `platformGate.js`
- Still ops: hard-reload provider tabs after unpacked reload; many duplicate SWs remain (Chrome artifact)
- Smoke: reload unpacked ext → refresh chatgpt tab → create/send once

### R4+ — chatgpt timeouts / NOT_FOUND after create

- Likely fallout of R3 (stale content script / bad chatId) — verify after R3

### R5 — 015–019 chatgpt `-32001` cascade = system, not tool body (2026-11-14) — MITIGATED

Smoke recheck: chatgpt `012–020` all **PASS** (including ask/get/outline/read/export/cache_sync).

Verdict was: **bridge / contention / timeout stacking**, not a broken `chats_get` / `chat_outline` / `chat_read` / `chats_export` implementation.

Evidence from `~/.chat-export/logs/server.log` + RUN:

- Same window: `chats_create` **PASS** (2.3s) + `chats_send` **PASS** (6.9s) on chatgpt — product path alive.
- 015 `chat_ask`: server `chat_ask wait timed out` (~105s, `timeout_s:45`) — wait/job, not “method missing”.
- 016–019: server `rpc timeout after 180000ms` while orch client reports `-32001` at **90s** (`timeoutMs` in run-list) — client aborts early; server keeps pending RPC.
- Overlapping zombie `chats_list` RPCs (chatgpt + perplexity) still burning 180s **during** 013–015 — dual load / leftover in-flight on `b-215c6f46`.
- 020: `WS_DISCONNECT` → `NOT_BOUND`; 021–023 slot miss fallout; 024–025 search **PASS** (no host RPC).
- After reconnect: `platforms_status` / `platforms_capabilities` / `projects_list` chatgpt **PASS** in tens–hundreds of ms.
- Do not treat 015–019 as four separate product bugs; recover bridge, avoid dual MCP on one browser during orch, then `--ids=015,016,017,018,019` smoke.

### R6 — full-run autopsy: `-32001` + real breakages (2026-11-14) — ORCH FIXED; host/env remain

Full walk finished: PASS 129 / FAIL 207 / SKIP 47. Of FAIL, **83 are `-32001`**.

Orch/protocol landed on `fix/mcp-runlist-red`: slot clear, timeout floor 190s, ErrorCode option codes, `PROJECTS_DISABLED` on grok-x/copilot projects stubs, browsersList demotes ghost online.

#### What `-32001` actually is

Not a tool-specific exception from Chat Export. It is the **MCP SDK client** aborting the HTTP tool call:

1. Orch `mcp-run-list.mjs` sets `callTool(..., { timeout: timeoutMs })` — most cases **90s**.
2. Server hub `rpcTimeoutMs` in `~/.chat-export/config.json` = **180000** → content RPC can sit **3 min**.
3. Client dies at 90s → RUN shows `-32001: Request timed out`; server log still shows `rpc timeout after 180000ms` / `chat_ask wait timed out` later.
4. Abandoned server RPC + next case on same browser → pile-up; one `WS_DISCONNECT` early (02:43Z) then reconnect; median fail duration in log = **180s**.

Top `-32001` tools: `chats_create` (20), `chat_ask` (10), `chats_list`/`chats_get` (9 each). Spread across all platforms → **system/orch mismatch**, not “chatgpt get broken”.

#### Orch bug: stale `{{chatId}}` slot bleed

`slots.chatId` is global for the whole run. On create FAIL/timeout it is **not cleared**. Next platform still interpolates the previous id.

Seen in RED/RUN: `f3f1c1a3-6b74-44c1-9980-602a1b056d05` on **claude + kimi + zai**; grok id `c8553c19-…` on **grok-x** `chat_read`. Those `NOT_FOUND` clusters are mostly **wrong-platform chatId**, not three independent delete bugs.

Fix direction (orch): clear `chatId`/`cacheId`/`containerId` on platform boundary or on failed `slot: chatId` create; optional per-platform slots.

#### Really broken / env (fix queue, not 207 lines)

| Signal | Where | Notes |
|--------|--------|--------|
| `projects_create` `BAD_REQUEST: matches no oneOf branch` | grok-x, copilot | schema/args — product |
| `ChatGPT submit failed` | chatgpt create | host submit path |
| `composer not found` / `invalid chat session id` / tab navigated away | deepseek | host/UI fragility |
| `Navigation rejected` | copilot cache_sync | host |
| Kimi delete `ChatService/UI delete not found` | kimi | may be bleed id — recheck after slot fix |
| Qwen dialog deleted mid-run | qwen read/export | host deleted chat |
| MiniMax `UNAUTHORIZED` sign-in | minimax | env |
| Perplexity `RATE_LIMIT` Pro | perplexity | env/paywall |
| Grok export/sync NOT_FOUND after PASS create | grok | possible real id loss — smoke alone |

Orch follow-ups: align case `timeoutMs` ≥ server `rpcTimeoutMs` (or cancel server RPC on client abort); one MCP client on the browser during walk; clear slots per platform.

## Matrix ops note

Do **not** restart full 11× lifecycle after each RED. Fix → smoke that platform/trap → next RED.

## 012 chats_list / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:33:41.976Z

## 015 chat_ask / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:35:21.352Z

## 016 chats_get / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:36:51.361Z

## 017 chat_outline / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:38:21.371Z

## 018 chat_read / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:39:51.399Z

## 019 chats_export / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:42:51.404Z

## 020 chat_cache_sync / chatgpt

- result: FAIL(NOT_BOUND:browser disconnected)
- actual: NOT_BOUND:browser disconnected
- at: 2026-11-14T02:43:44.663Z

## 021 chat_cache_read / chatgpt

- result: FAIL(missing slots: cacheId)
- actual: missing slots: cacheId
- at: 2026-11-14T02:43:44.664Z

## 022 chat_cache_append / chatgpt

- result: FAIL(missing slots: cacheId)
- actual: missing slots: cacheId
- at: 2026-11-14T02:43:44.664Z

## 023 chat_cache_update_block / chatgpt

- result: FAIL(missing slots: cacheId)
- actual: missing slots: cacheId
- at: 2026-11-14T02:43:44.664Z

## 026 jobs_enqueue / chatgpt

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T02:46:45.189Z

## 029 jobs_enqueue / chatgpt

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T02:49:45.431Z

## 030 jobs_enqueue / chatgpt

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T02:52:45.831Z

## 036 chats_create / chatgpt

- result: FAIL(HOST_ERROR:ChatGPT submit failed)
- actual: HOST_ERROR:ChatGPT submit failed
- at: 2026-11-14T02:53:56.861Z

## 037 jobs_enqueue / chatgpt

- result: FAIL(missing slots: chatId2)
- actual: missing slots: chatId2
- at: 2026-11-14T02:53:56.863Z

## 038 chats_delete / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:55:26.846Z

## 039 chats_create / chatgpt

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:56:56.854Z

## 040 jobs_enqueue / chatgpt

- result: FAIL(missing slots: chatId3)
- actual: missing slots: chatId3
- at: 2026-11-14T02:56:56.858Z

## 046 chats_list / grok

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T02:58:28.098Z

## 049 chat_ask / grok

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:00:05.169Z

## 050 chats_get / grok

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:01:35.181Z

## 051 chat_outline / grok

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:03:05.193Z

## 052 chat_read / grok

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:04:35.205Z

## 053 chats_export / grok

- result: FAIL(NOT_FOUND:conversation not found: c8553c19-d4ee-4c56-8778-fbe8fe230fcb)
- actual: NOT_FOUND:conversation not found: c8553c19-d4ee-4c56-8778-fbe8fe230fcb
- at: 2026-11-14T03:04:35.567Z

## 054 chat_cache_sync / grok

- result: FAIL(NOT_FOUND:conversation not found: c8553c19-d4ee-4c56-8778-fbe8fe230fcb)
- actual: NOT_FOUND:conversation not found: c8553c19-d4ee-4c56-8778-fbe8fe230fcb
- at: 2026-11-14T03:04:35.831Z

## 055 chat_cache_read / grok

- result: FAIL(missing slots: cacheId)
- actual: missing slots: cacheId
- at: 2026-11-14T03:04:35.832Z

## 056 chat_cache_append / grok

- result: FAIL(missing slots: cacheId)
- actual: missing slots: cacheId
- at: 2026-11-14T03:04:35.832Z

## 057 chat_cache_update_block / grok

- result: FAIL(missing slots: cacheId)
- actual: missing slots: cacheId
- at: 2026-11-14T03:04:35.832Z

## 060 jobs_enqueue / grok

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:07:35.980Z

## 063 jobs_enqueue / grok

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:10:36.759Z

## 064 jobs_enqueue / grok

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:13:37.615Z

## 071 jobs_enqueue / grok

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:17:20.393Z

## 072 chats_delete / grok

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:18:50.401Z

## 074 jobs_enqueue / grok

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:21:52.164Z

## 080 chats_list / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:23:24.611Z

## 081 chats_create / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:24:54.625Z

## 082 chats_send / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:26:24.642Z

## 083 chat_ask / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:27:54.673Z

## 084 chats_get / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:29:24.679Z

## 085 chat_outline / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:30:54.684Z

## 086 chat_read / grok-x

- result: FAIL(NOT_FOUND:conversation not found or empty: c8553c19-d4ee-4c56-8778-fbe8fe230fcb)
- actual: NOT_FOUND:conversation not found or empty: c8553c19-d4ee-4c56-8778-fbe8fe230fcb
- at: 2026-11-14T03:31:31.090Z

## 091 chat_cache_update_block / grok-x

- result: FAIL(NOT_FOUND:cache block not found at turnIndex 0)
- actual: NOT_FOUND:cache block not found at turnIndex 0
- at: 2026-11-14T03:31:41.210Z

## 094 jobs_enqueue / grok-x

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:34:41.854Z

## 097 jobs_enqueue / grok-x

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:37:42.492Z

## 098 jobs_enqueue / grok-x

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:40:42.829Z

## 100 projects_create / grok-x

- result: FAIL(BAD_REQUEST:matches no oneOf branch)
- actual: BAD_REQUEST:matches no oneOf branch
- at: 2026-11-14T03:40:42.937Z

## 104 chats_create / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:42:12.943Z

## 105 jobs_enqueue / grok-x

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:45:13.451Z

## 106 chats_delete / grok-x

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:46:43.465Z

## 108 jobs_enqueue / grok-x

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:49:48.730Z

## 116 chats_send / copilot

- result: FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot)
- actual: UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot
- at: 2026-11-14T03:50:04.916Z

## 117 chat_ask / copilot

- result: FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot)
- actual: UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot
- at: 2026-11-14T03:50:06.092Z

## 118 chats_get / copilot

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:51:36.099Z

## 119 chat_outline / copilot

- result: FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot)
- actual: UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot
- at: 2026-11-14T03:51:37.833Z

## 120 chat_read / copilot

- result: FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot)
- actual: UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot
- at: 2026-11-14T03:51:38.662Z

## 121 chats_export / copilot

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T03:54:38.672Z

## 122 chat_cache_sync / copilot

- result: FAIL(HOST_ERROR:Navigation rejected.)
- actual: HOST_ERROR:Navigation rejected.
- at: 2026-11-14T03:54:38.751Z

## 123 chat_cache_read / copilot

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T03:54:38.788Z

## 124 chat_cache_append / copilot

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T03:54:38.821Z

## 125 chat_cache_update_block / copilot

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T03:54:38.851Z

## 128 jobs_enqueue / copilot

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T03:57:39.402Z

## 131 jobs_enqueue / copilot

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:00:40.044Z

## 132 jobs_enqueue / copilot

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:03:40.617Z

## 134 projects_create / copilot

- result: FAIL(BAD_REQUEST:matches no oneOf branch)
- actual: BAD_REQUEST:matches no oneOf branch
- at: 2026-11-14T04:03:40.709Z

## 138 chats_create / copilot

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:05:10.716Z

## 139 jobs_enqueue / copilot

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:08:11.311Z

## 141 chats_create / copilot

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:09:43.603Z

## 142 jobs_enqueue / copilot

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:12:44.133Z

## 148 chats_list / claude

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:14:14.408Z

## 149 chats_create / claude

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:15:44.425Z

## 150 chats_send / claude

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:17:14.443Z

## 151 chat_ask / claude

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:18:44.453Z

## 152 chats_get / claude

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T04:18:45.827Z

## 153 chat_outline / claude

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T04:18:46.952Z

## 154 chat_read / claude

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T04:18:48.104Z

## 155 chats_export / claude

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T04:18:49.301Z

## 156 chat_cache_sync / claude

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T04:18:50.349Z

## 159 chat_cache_update_block / claude

- result: FAIL(NOT_FOUND:cache block not found at turnIndex 0)
- actual: NOT_FOUND:cache block not found at turnIndex 0
- at: 2026-11-14T04:18:50.462Z

## 162 jobs_enqueue / claude

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:21:51.108Z

## 165 jobs_enqueue / claude

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:24:51.779Z

## 166 jobs_enqueue / claude

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:27:52.027Z

## 172 chats_create / claude

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:30:22.603Z

## 173 jobs_enqueue / claude

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:33:23.370Z

## 174 chats_delete / claude

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T04:33:23.871Z

## 175 chats_create / claude

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:34:53.884Z

## 176 jobs_enqueue / claude

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:37:54.732Z

## 179 tabs_ensure / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:38:54.834Z

## 183 chats_create / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:40:32.425Z

## 184 chats_send / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:42:02.436Z

## 185 chat_ask / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:43:32.449Z

## 186 chats_get / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:45:02.463Z

## 187 chat_outline / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:46:32.466Z

## 188 chat_read / qwen

- result: FAIL(NOT_FOUND:Этот диалог был удален. Перенаправление на главную страницу через 3 секунды.)
- actual: NOT_FOUND:Этот диалог был удален. Перенаправление на главную страницу через 3 секунды.
- at: 2026-11-14T04:46:33.546Z

## 189 chats_export / qwen

- result: FAIL(NOT_FOUND:Этот диалог был удален. Перенаправление на главную страницу через 3 секунды.)
- actual: NOT_FOUND:Этот диалог был удален. Перенаправление на главную страницу через 3 секунды.
- at: 2026-11-14T04:46:33.930Z

## 190 chat_cache_sync / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T04:49:33.945Z

## 191 chat_cache_read / qwen

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T04:49:34.026Z

## 192 chat_cache_append / qwen

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T04:49:34.054Z

## 193 chat_cache_update_block / qwen

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T04:49:34.081Z

## 196 jobs_enqueue / qwen

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:52:34.896Z

## 199 jobs_enqueue / qwen

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:55:35.797Z

## 200 jobs_enqueue / qwen

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T04:58:36.543Z

## 206 chats_create / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:00:06.650Z

## 207 jobs_enqueue / qwen

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:03:07.362Z

## 208 chats_delete / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:04:37.378Z

## 209 chats_create / qwen

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:06:07.386Z

## 210 jobs_enqueue / qwen

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:09:08.139Z

## 211 chat_cache_delete / qwen

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:09:08.194Z

## 213 tabs_ensure / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:10:08.236Z

## 215 platforms_capabilities / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:12:08.320Z

## 216 chats_list / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:13:38.325Z

## 217 chats_create / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:15:08.342Z

## 218 chats_send / deepseek

- result: FAIL(HOST_ERROR:composer not found)
- actual: HOST_ERROR:composer not found
- at: 2026-11-14T05:15:08.484Z

## 219 chat_ask / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:16:38.494Z

## 220 chats_get / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:18:08.501Z

## 221 chat_outline / deepseek

- result: FAIL(UNAUTHORIZED:get INVALID_TOKEN)
- actual: UNAUTHORIZED:get INVALID_TOKEN
- at: 2026-11-14T05:18:08.910Z

## 222 chat_read / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:19:38.920Z

## 223 chats_export / deepseek

- result: FAIL(HOST_ERROR:get invalid chat session id)
- actual: HOST_ERROR:get invalid chat session id
- at: 2026-11-14T05:19:39.448Z

## 224 chat_cache_sync / deepseek

- result: FAIL(UNAUTHORIZED:get INVALID_TOKEN)
- actual: UNAUTHORIZED:get INVALID_TOKEN
- at: 2026-11-14T05:19:39.785Z

## 225 chat_cache_read / deepseek

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:19:39.825Z

## 226 chat_cache_append / deepseek

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:19:39.854Z

## 227 chat_cache_update_block / deepseek

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:19:39.880Z

## 230 jobs_enqueue / deepseek

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:22:40.772Z

## 233 jobs_enqueue / deepseek

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:25:40.940Z

## 234 jobs_enqueue / deepseek

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:28:41.571Z

## 240 chats_create / deepseek

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:30:11.707Z

## 241 jobs_enqueue / deepseek

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:33:11.863Z

## 242 chats_delete / deepseek

- result: FAIL(UNAUTHORIZED:delete INVALID_TOKEN)
- actual: UNAUTHORIZED:delete INVALID_TOKEN
- at: 2026-11-14T05:33:12.228Z

## 243 chats_create / deepseek

- result: FAIL(HOST_ERROR:deepseek tab navigated away during chats.create (page reload / bfcache); result unknown)
- actual: HOST_ERROR:deepseek tab navigated away during chats.create (page reload / bfcache); result unknown
- at: 2026-11-14T05:33:31.527Z

## 244 jobs_enqueue / deepseek

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:36:32.251Z

## 245 chat_cache_delete / deepseek

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:36:32.297Z

## 250 chats_list / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:38:03.391Z

## 251 chats_create / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:39:33.407Z

## 252 chats_send / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:41:03.421Z

## 253 chat_ask / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:42:33.433Z

## 254 chats_get / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:44:03.444Z

## 255 chat_outline / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:45:33.463Z

## 256 chat_read / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:47:03.470Z

## 257 chats_export / perplexity

- result: FAIL(UNAUTHORIZED:thread not available via API)
- actual: UNAUTHORIZED:thread not available via API
- at: 2026-11-14T05:47:03.773Z

## 258 chat_cache_sync / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T05:50:03.759Z

## 259 chat_cache_read / perplexity

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:50:03.837Z

## 260 chat_cache_append / perplexity

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:50:03.863Z

## 261 chat_cache_update_block / perplexity

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T05:50:03.889Z

## 264 jobs_enqueue / perplexity

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:53:04.585Z

## 267 jobs_enqueue / perplexity

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:56:05.534Z

## 268 jobs_enqueue / perplexity

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T05:59:06.370Z

## 274 chats_create / perplexity

- result: FAIL(RATE_LIMIT:Перейти на Pro)
- actual: RATE_LIMIT:Перейти на Pro
- at: 2026-11-14T05:59:11.566Z

## 275 jobs_enqueue / perplexity

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:02:12.412Z

## 276 chats_delete / perplexity

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:03:42.431Z

## 277 chats_create / perplexity

- result: FAIL(RATE_LIMIT:Перейти на Pro)
- actual: RATE_LIMIT:Перейти на Pro
- at: 2026-11-14T06:03:45.927Z

## 278 jobs_enqueue / perplexity

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:06:46.726Z

## 279 chat_cache_delete / perplexity

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T06:06:46.784Z

## 281 tabs_ensure / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:07:46.817Z

## 284 chats_list / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:09:16.986Z

## 285 chats_create / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:10:46.993Z

## 286 chats_send / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:12:17.006Z

## 287 chat_ask / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:13:47.017Z

## 288 chats_get / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:15:17.026Z

## 291 chats_export / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:18:19.057Z

## 295 chat_cache_update_block / kimi

- result: FAIL(NOT_FOUND:cache block not found at turnIndex 0)
- actual: NOT_FOUND:cache block not found at turnIndex 0
- at: 2026-11-14T06:18:20.158Z

## 298 jobs_enqueue / kimi

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:21:20.279Z

## 301 jobs_enqueue / kimi

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:24:20.669Z

## 302 jobs_enqueue / kimi

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:27:20.766Z

## 308 chats_create / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:28:50.873Z

## 309 jobs_enqueue / kimi

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:31:51.241Z

## 310 chats_delete / kimi

- result: FAIL(HOST_ERROR:Kimi delete unavailable — ChatService/UI delete not found for: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: HOST_ERROR:Kimi delete unavailable — ChatService/UI delete not found for: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T06:31:53.728Z

## 311 chats_create / kimi

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:33:23.739Z

## 312 jobs_enqueue / kimi

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:36:23.927Z

## 315 tabs_ensure / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:37:24.033Z

## 318 chats_list / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:38:55.473Z

## 319 chats_create / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:40:25.488Z

## 321 chat_ask / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:41:56.012Z

## 322 chats_get / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:43:26.018Z

## 323 chat_outline / zai

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T06:43:26.400Z

## 324 chat_read / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:44:56.406Z

## 325 chats_export / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:47:56.416Z

## 326 chat_cache_sync / zai

- result: FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05)
- actual: NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05
- at: 2026-11-14T06:47:57.440Z

## 327 chat_cache_read / zai

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T06:47:57.469Z

## 328 chat_cache_append / zai

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T06:47:57.498Z

## 329 chat_cache_update_block / zai

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T06:47:57.527Z

## 332 jobs_enqueue / zai

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:50:58.162Z

## 335 jobs_enqueue / zai

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:53:58.460Z

## 336 jobs_enqueue / zai

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T06:56:58.894Z

## 342 chats_create / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T06:58:28.977Z

## 343 jobs_enqueue / zai

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T07:01:29.342Z

## 344 chats_delete / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:02:59.360Z

## 345 chats_create / zai

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:04:29.384Z

## 346 jobs_enqueue / zai

- result: FAIL(TIMEOUT:job timeout)
- actual: TIMEOUT:job timeout
- at: 2026-11-14T07:07:30.103Z

## 349 tabs_ensure / minimax

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:08:30.799Z

## 352 chats_list / minimax

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:10:08.388Z

## 353 chats_create / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:10:09.302Z

## 354 chats_send / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:10:09.592Z

## 355 chat_ask / minimax

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:11:39.611Z

## 356 chats_get / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:11:40.447Z

## 357 chat_outline / minimax

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:13:10.474Z

## 358 chat_read / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:13:11.086Z

## 360 chat_cache_sync / minimax

- result: FAIL(-32001:MCP error -32001: Request timed out)
- actual: -32001:MCP error -32001: Request timed out
- at: 2026-11-14T07:16:15.980Z

## 361 chat_cache_read / minimax

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T07:16:16.492Z

## 362 chat_cache_append / minimax

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T07:16:17.168Z

## 363 chat_cache_update_block / minimax

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T07:16:17.553Z

## 366 jobs_enqueue / minimax

- result: FAIL(ok:0 failed:1 UNAUTHORIZED)
- actual: ok:0 failed:1 UNAUTHORIZED
- at: 2026-11-14T07:16:19.884Z

## 369 jobs_enqueue / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:16:22.446Z

## 376 chats_create / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:16:30.670Z

## 377 jobs_enqueue / minimax

- result: FAIL(DESTRUCTIVE_DISABLED:testOnly: chat title does not start with [ce-test])
- actual: DESTRUCTIVE_DISABLED:testOnly: chat title does not start with [ce-test]
- at: 2026-11-14T07:16:36.819Z

## 378 chats_delete / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:16:37.217Z

## 379 chats_create / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T07:16:37.461Z

## 380 jobs_enqueue / minimax

- result: FAIL(ok:0 failed:1 DESTRUCTIVE_DISABLED)
- actual: ok:0 failed:1 DESTRUCTIVE_DISABLED
- at: 2026-11-14T07:16:43.710Z

## 381 chat_cache_delete / minimax

- result: FAIL(NOT_FOUND:cached chat not found)
- actual: NOT_FOUND:cached chat not found
- at: 2026-11-14T07:16:44.097Z

## 086 chat_read / grok-x

- result: FAIL(NOT_FOUND:conversation not found or empty: 2121544326282920000)
- actual: NOT_FOUND:conversation not found or empty: 2121544326282920000
- at: 2026-11-14T10:02:39.896Z

## 115 chats_create / copilot

- result: FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot)
- actual: UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot
- at: 2026-11-14T10:02:43.110Z

## 122 chat_cache_sync / copilot

- result: FAIL(missing slots: chatId)
- actual: missing slots: chatId
- at: 2026-11-14T10:02:43.111Z

## 134 projects_create / copilot

- result: FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot)
- actual: UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot
- at: 2026-11-14T10:02:44.369Z

## 183 chats_create / qwen

- result: FAIL(HOST_ERROR:Qwen chatId timeout)
- actual: HOST_ERROR:Qwen chatId timeout
- at: 2026-11-14T10:05:26.248Z

## 217 chats_create / deepseek

- result: FAIL(HOST_ERROR:deepseek tab navigated away during chats.create (page reload / bfcache); result unknown)
- actual: HOST_ERROR:deepseek tab navigated away during chats.create (page reload / bfcache); result unknown
- at: 2026-11-14T10:05:37.632Z

## 251 chats_create / perplexity

- result: FAIL(RATE_LIMIT:Перейти на Pro)
- actual: RATE_LIMIT:Перейти на Pro
- at: 2026-11-14T10:05:43.240Z

## 285 chats_create / kimi

- result: FAIL(HOST_ERROR:Kimi chatId timeout)
- actual: HOST_ERROR:Kimi chatId timeout
- at: 2026-11-14T10:07:52.266Z

## 310 chats_delete / kimi

- result: FAIL(missing slots: chatId)
- actual: missing slots: chatId
- at: 2026-11-14T10:07:52.267Z

## 319 chats_create / zai

- result: FAIL(HOST_ERROR:Z.ai chatId timeout)
- actual: HOST_ERROR:Z.ai chatId timeout
- at: 2026-11-14T10:10:26.247Z

## 353 chats_create / minimax

- result: FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in)
- actual: UNAUTHORIZED:MiniMax Agent requires sign-in
- at: 2026-11-14T10:10:29.692Z

## 086 chat_read / grok-x

- result: FAIL(NOT_FOUND:conversation not found or empty: 2121546549494796561)
- actual: NOT_FOUND:conversation not found or empty: 2121546549494796561
- at: 2026-11-14T10:11:29.752Z
