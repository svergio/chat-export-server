# MCP live matrix RUN

- Started: 2026-11-14T02:08:50.137Z
- Finished: 2026-11-14T02:16:12.683Z
- MCP: http://127.0.0.1:8765/mcp
- Browser: b-215c6f46
- Platforms: chatgpt, grok, grok-x, copilot, claude, qwen, deepseek, perplexity, kimi, zai, minimax
- skipAsk: false

## Session

| Tool | Result |
| --- | --- |
| browsers_list | PASS(n=3) |
| browsers_bind | PASS(b-215c6f46) |
| browsers_status | PASS(platforms=11) |

## Agent traps

| Id | Result | Note |
| --- | --- | --- |
| T5 | FAIL(testOnly describe says dry-run) | When true, validate only without mutating |
| T1 | SKIP(no online empty-platforms browser) | b-215c6f46:online:11,b-5b508c84:registered:0,b-livecheck:offline:0 offlineEmpty=b-5b508c84,b-livecheck |
| T2 | SKIP(paywall-preempted RATE_LIMIT) | perplexity/b737e1aa-37b0-44bb-87f2-2bfc2f19f1da |
| T3 | FAIL(delete blocked before testOnly RATE_LIMIT) | Pro Бесплатный предпросмотр расширенного поиска включён. Подробнее |
| T4 | PASS(runner asserts result.ok/failed) | policy |
| T6 | PASS(single NodeRed MCP assumed) | operator |

## Lifecycle P00–P26

| Step | chatgpt | grok | grok-x | copilot | claude | qwen | deepseek | perplexity | kimi | zai | minimax |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P00 | PASS(enabled) | — | — | — | — | — | — | — | — | — | — |
| P01 | PASS(reuse) | — | — | — | — | — | — | — | — | — | — |
| P02 | PASS(ok kind= busy=undefined cr=true) | — | — | — | — | — | — | — | — | — | — |
| P03 | PASS(models) | — | — | — | — | — | — | — | — | — | — |
| P04 | FAIL(-32001:MCP error -32001: Request timed out) | — | — | — | — | — | — | — | — | — | — |
| P05 | PASS(6af7c30f-b81c-83eb-be99-) | — | — | — | — | — | — | — | — | — | — |
| P06 | FAIL(-32001:MCP error -32001: Request timed out) | — | — | — | — | — | — | — | — | — | — |
| P07 | FAIL(-32001:MCP error -32001: Request timed out) | — | — | — | — | — | — | — | — | — | — |
| P08 | FAIL(NOT_FOUND:conversation not found: 6af7c30f-b81c-83eb-be99-ebfb7b24473c) | — | — | — | — | — | — | — | — | — | — |
| P09 | FAIL(-32001:MCP error -32001: Request timed out) | — | — | — | — | — | — | — | — | — | — |
| P10 | FAIL(NOT_FOUND:conversation not found: 6af7c30f-b81c-83eb-be99-ebfb7b24473c) | — | — | — | — | — | — | — | — | — | — |
| P11 | — | — | — | — | — | — | — | — | — | — | — |
| P12 | — | — | — | — | — | — | — | — | — | — | — |
| P13 | — | — | — | — | — | — | — | — | — | — | — |
| P14 | — | — | — | — | — | — | — | — | — | — | — |
| P15 | — | — | — | — | — | — | — | — | — | — | — |
| P16 | — | — | — | — | — | — | — | — | — | — | — |
| P17 | — | — | — | — | — | — | — | — | — | — | — |
| P18 | — | — | — | — | — | — | — | — | — | — | — |
| P19 | — | — | — | — | — | — | — | — | — | — | — |
| P20 | — | — | — | — | — | — | — | — | — | — | — |
| P21 | — | — | — | — | — | — | — | — | — | — | — |
| P22 | — | — | — | — | — | — | — | — | — | — | — |
| P23 | — | — | — | — | — | — | — | — | — | — | — |
| P24 | — | — | — | — | — | — | — | — | — | — | — |
| P25 | — | — | — | — | — | — | — | — | — | — | — |
| P26 | — | — | — | — | — | — | — | — | — | — | — |

## MCP tools

| Tool | all | chatgpt | grok | grok-x | copilot | claude | qwen | deepseek | perplexity | kimi | zai | minimax | janitorai |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| browsers_list | PASS(n=3) | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| browsers_bind | PASS(b-215c6f46) | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| browsers_status | PASS(platforms=11) | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| platforms_list | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| platforms_status | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| platforms_capabilities | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| tabs_ensure | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_list | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_get | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_outline | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_read | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_export | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_create | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_send | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_ask | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_delete | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_cache_sync | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_cache_read | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_cache_append | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_cache_update_block | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chat_cache_delete | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| chats_search | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| tabs_search | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| projects_list | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| projects_chats | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| projects_create | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| projects_delete | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| projects_move_chat | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| jobs_enqueue | FAIL(schema-check) | — | — | — | — | — | — | — | PASS(T2-testOnly) | — | — | — | SKIP(wire-filtered) |
| jobs_status | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| jobs_list | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |
| jobs_cancel | — | — | — | — | — | — | — | — | — | — | — | — | SKIP(wire-filtered) |

## RED count: 9

