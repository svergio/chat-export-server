# MCP live matrix FINAL — 20261114T165255Z

- Browser: `b-215c6f46` ЗАЛОГИНЕНЫЕ (full list only)
- Server 1.1.1 / ext 2.1.5
- Cases: **383** → **208 PASS / 131 FAIL / 44 SKIP**
- Artifacts:
  - `docs/qa/mcp-run-list-20261114T165255Z.log`
  - `docs/qa/mcp-run-list-RUN-20261114T165255Z.md`
  - `docs/qa/mcp-live-matrix-RED-20261114T165255Z.md`

## How to read FAIL

- **131 FAIL total**, of which **103 = cascade `missing slots`** after create/ask failed (not separate MCP bugs).
- **28 root FAILs** below = real signals to fix / env.

## Root MCP / host problems

| Area | Signal | Platforms / notes |
| --- | --- | --- |
| `chats_create` chatId timeout | `HOST_ERROR:* chatId timeout` | chatgpt×2, qwen×3, kimi×3, **zai×3** |
| MCP host RPC timeout | `-32001 Request timed out` | deepseek×3, minimax×3 |
| Ask / job wait | `TIMEOUT` chat_ask / job | grok×2 |
| Paywall | `RATE_LIMIT` «Перейти на Pro» | perplexity×2 (+ cascade) |
| Session | `unauthorized: Token has expired` | qwen `platforms_capabilities` |
| Safety gate | `DESTRUCTIVE_DISABLED` testOnly title | copilot×2, claude×2 (trap/batch on non-`[ce-test]` titles) |
| Delete | `NOT_FOUND` conversation | chatgpt×1 (stale id after create timeout) |

## Green enough

- Session tools: browsers_list/bind/status PASS
- Full lifecycle mostly green: **chatgpt** (until late create), **grok**, **grok-x**, **copilot**, **claude**
- Trap T5 schema PASS; T2 testOnly PASS

## Out of scope this run

- Guest browser (НЕЗАЛОГИНЕНЫЕ): confirm no-login ≠ product FAIL — not in this list
- Post-RED fixes: Z.ai free/coder modes and other create-timeout hosts

## FAIL by platform (incl. cascades)

chatgpt 5 · grok 2 · copilot 2 · claude 2 · qwen 21 · deepseek 20 · perplexity 19 · kimi 20 · zai 20 · minimax 20
