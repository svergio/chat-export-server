# MCP run-list RED SMOKE

- Started: 2026-11-14T10:02:00Z
- Browser: b-215c6f46

| Id | Tool | Platform | Result |
| --- | --- | --- | --- |
| 001 | browsers_list | * | PASS |
| 002 | browsers_bind | * | PASS |
| 003 | browsers_status | * | PASS |
| 012 | chats_list | chatgpt | PASS |
| 013 | chats_create | chatgpt | PASS |
| 014 | chats_send | chatgpt | PASS |
| 015 | chat_ask | chatgpt | PASS |
| 016 | chats_get | chatgpt | PASS |
| 017 | chat_outline | chatgpt | PASS |
| 018 | chat_read | chatgpt | PASS |
| 019 | chats_export | chatgpt | PASS |
| 020 | chat_cache_sync | chatgpt | PASS |
| 047 | chats_create | grok | PASS |
| 053 | chats_export | grok | PASS |
| 054 | chat_cache_sync | grok | PASS |
| 081 | chats_create | grok-x | PASS |
| 086 | chat_read | grok-x | FAIL(NOT_FOUND:conversation not found or empty: 2121544326282920000) |
| 100 | projects_create | grok-x | SKIP(unsupported:OPTION_NOT_FOUND) |
| 115 | chats_create | copilot | FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot) |
| 122 | chat_cache_sync | copilot | FAIL(missing slots: chatId) |
| 134 | projects_create | copilot | FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot) |
| 149 | chats_create | claude | PASS |
| 152 | chats_get | claude | PASS |
| 183 | chats_create | qwen | FAIL(HOST_ERROR:Qwen chatId timeout) |
| 217 | chats_create | deepseek | FAIL(HOST_ERROR:deepseek tab navigated away during chats.create (page reload / bfcache); result unknown) |
| 251 | chats_create | perplexity | FAIL(RATE_LIMIT:Перейти на Pro) |
| 285 | chats_create | kimi | FAIL(HOST_ERROR:Kimi chatId timeout) |
| 310 | chats_delete | kimi | FAIL(missing slots: chatId) |
| 319 | chats_create | zai | FAIL(HOST_ERROR:Z.ai chatId timeout) |
| 353 | chats_create | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 081 | chats_create | grok-x | PASS |
| 086 | chat_read | grok-x | FAIL(NOT_FOUND:conversation not found or empty: 2121546549494796561) |
