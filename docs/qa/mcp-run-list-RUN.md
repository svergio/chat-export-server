# MCP run-list RUN

- Started: pending

| Id | Tool | Platform | Result |
| --- | --- | --- | --- |
| 001 | browsers_list | * | PASS |
| 002 | browsers_bind | * | PASS |
| 003 | browsers_status | * | PASS |
| 004 | __trap_T5_schema_testOnly | * | PASS(schema ok) |
| 005 | __trap_T1_empty_platforms | * | SKIP(no online empty-platforms browser) |
| 006 | __trap_T2_testOnly_default | perplexity | PASS(ok:0 DESTRUCTIVE_DISABLED) |
| 007 | __skip_janitorai | janitorai | SKIP(wire-filtered) |
| 008 | platforms_list | chatgpt | PASS |
| 009 | tabs_ensure | chatgpt | PASS |
| 010 | platforms_status | chatgpt | PASS |
| 011 | platforms_capabilities | chatgpt | PASS |
| 012 | chats_list | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 013 | chats_create | chatgpt | PASS |
| 014 | chats_send | chatgpt | PASS |
| 015 | chat_ask | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 016 | chats_get | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 017 | chat_outline | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 018 | chat_read | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 019 | chats_export | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 020 | chat_cache_sync | chatgpt | FAIL(NOT_BOUND:browser disconnected) |
| 021 | chat_cache_read | chatgpt | FAIL(missing slots: cacheId) |
| 022 | chat_cache_append | chatgpt | FAIL(missing slots: cacheId) |
| 023 | chat_cache_update_block | chatgpt | FAIL(missing slots: cacheId) |
| 024 | chats_search | chatgpt | PASS |
| 025 | tabs_search | chatgpt | PASS |
| 026 | jobs_enqueue | chatgpt | FAIL(TIMEOUT:job timeout) |
| 027 | jobs_status | chatgpt | PASS |
| 028 | jobs_list | chatgpt | PASS |
| 029 | jobs_enqueue | chatgpt | FAIL(TIMEOUT:job timeout) |
| 030 | jobs_enqueue | chatgpt | FAIL(TIMEOUT:job timeout) |
| 031 | projects_list | chatgpt | PASS |
| 032 | projects_create | chatgpt | SKIP(unsupported:-32001) |
| 033 | projects_chats | chatgpt | SKIP(missing slots: containerId) |
| 034 | projects_move_chat | chatgpt | SKIP(missing slots: containerId) |
| 035 | projects_delete | chatgpt | SKIP(missing slots: containerId) |
| 036 | chats_create | chatgpt | FAIL(HOST_ERROR:ChatGPT submit failed) |
| 037 | jobs_enqueue | chatgpt | FAIL(missing slots: chatId2) |
| 038 | chats_delete | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 039 | chats_create | chatgpt | FAIL(-32001:MCP error -32001: Request timed out) |
| 040 | jobs_enqueue | chatgpt | FAIL(missing slots: chatId3) |
| 041 | chat_cache_delete | chatgpt | SKIP(missing slots: cacheId) |
| 042 | platforms_list | grok | PASS |
| 043 | tabs_ensure | grok | PASS |
| 044 | platforms_status | grok | PASS |
| 045 | platforms_capabilities | grok | PASS |
| 046 | chats_list | grok | FAIL(-32001:MCP error -32001: Request timed out) |
| 047 | chats_create | grok | PASS |
| 048 | chats_send | grok | PASS |
| 049 | chat_ask | grok | FAIL(-32001:MCP error -32001: Request timed out) |
| 050 | chats_get | grok | FAIL(-32001:MCP error -32001: Request timed out) |
| 051 | chat_outline | grok | FAIL(-32001:MCP error -32001: Request timed out) |
| 052 | chat_read | grok | FAIL(-32001:MCP error -32001: Request timed out) |
| 053 | chats_export | grok | FAIL(NOT_FOUND:conversation not found: c8553c19-d4ee-4c56-8778-fbe8fe230fcb) |
| 054 | chat_cache_sync | grok | FAIL(NOT_FOUND:conversation not found: c8553c19-d4ee-4c56-8778-fbe8fe230fcb) |
| 055 | chat_cache_read | grok | FAIL(missing slots: cacheId) |
| 056 | chat_cache_append | grok | FAIL(missing slots: cacheId) |
| 057 | chat_cache_update_block | grok | FAIL(missing slots: cacheId) |
| 058 | chats_search | grok | PASS |
| 059 | tabs_search | grok | PASS |
| 060 | jobs_enqueue | grok | FAIL(TIMEOUT:job timeout) |
| 061 | jobs_status | grok | PASS |
| 062 | jobs_list | grok | PASS |
| 063 | jobs_enqueue | grok | FAIL(TIMEOUT:job timeout) |
| 064 | jobs_enqueue | grok | FAIL(TIMEOUT:job timeout) |
| 065 | projects_list | grok | SKIP(unsupported:-32001) |
| 066 | projects_create | grok | SKIP(unsupported:HOST_ERROR) |
| 067 | projects_chats | grok | SKIP(missing slots: containerId) |
| 068 | projects_move_chat | grok | SKIP(missing slots: containerId) |
| 069 | projects_delete | grok | SKIP(missing slots: containerId) |
| 070 | chats_create | grok | PASS |
| 071 | jobs_enqueue | grok | FAIL(TIMEOUT:job timeout) |
| 072 | chats_delete | grok | FAIL(-32001:MCP error -32001: Request timed out) |
| 073 | chats_create | grok | PASS |
| 074 | jobs_enqueue | grok | FAIL(TIMEOUT:job timeout) |
| 075 | chat_cache_delete | grok | SKIP(missing slots: cacheId) |
| 076 | platforms_list | grok-x | PASS |
| 077 | tabs_ensure | grok-x | PASS |
| 078 | platforms_status | grok-x | PASS |
| 079 | platforms_capabilities | grok-x | PASS |
| 080 | chats_list | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 081 | chats_create | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 082 | chats_send | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 083 | chat_ask | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 084 | chats_get | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 085 | chat_outline | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 086 | chat_read | grok-x | FAIL(NOT_FOUND:conversation not found or empty: c8553c19-d4ee-4c56-8778-fbe8fe230fcb) |
| 087 | chats_export | grok-x | PASS |
| 088 | chat_cache_sync | grok-x | PASS |
| 089 | chat_cache_read | grok-x | PASS |
| 090 | chat_cache_append | grok-x | PASS |
| 091 | chat_cache_update_block | grok-x | FAIL(NOT_FOUND:cache block not found at turnIndex 0) |
| 092 | chats_search | grok-x | PASS |
| 093 | tabs_search | grok-x | PASS |
| 094 | jobs_enqueue | grok-x | FAIL(TIMEOUT:job timeout) |
| 095 | jobs_status | grok-x | PASS |
| 096 | jobs_list | grok-x | PASS |
| 097 | jobs_enqueue | grok-x | FAIL(TIMEOUT:job timeout) |
| 098 | jobs_enqueue | grok-x | FAIL(TIMEOUT:job timeout) |
| 099 | projects_list | grok-x | PASS |
| 100 | projects_create | grok-x | FAIL(BAD_REQUEST:matches no oneOf branch) |
| 101 | projects_chats | grok-x | SKIP(missing slots: containerId) |
| 102 | projects_move_chat | grok-x | SKIP(missing slots: containerId) |
| 103 | projects_delete | grok-x | SKIP(missing slots: containerId) |
| 104 | chats_create | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 105 | jobs_enqueue | grok-x | FAIL(TIMEOUT:job timeout) |
| 106 | chats_delete | grok-x | FAIL(-32001:MCP error -32001: Request timed out) |
| 107 | chats_create | grok-x | PASS |
| 108 | jobs_enqueue | grok-x | FAIL(TIMEOUT:job timeout) |
| 109 | chat_cache_delete | grok-x | PASS |
| 110 | platforms_list | copilot | PASS |
| 111 | tabs_ensure | copilot | PASS |
| 112 | platforms_status | copilot | PASS |
| 113 | platforms_capabilities | copilot | PASS |
| 114 | chats_list | copilot | PASS |
| 115 | chats_create | copilot | PASS |
| 116 | chats_send | copilot | FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot) |
| 117 | chat_ask | copilot | FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot) |
| 118 | chats_get | copilot | FAIL(-32001:MCP error -32001: Request timed out) |
| 119 | chat_outline | copilot | FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot) |
| 120 | chat_read | copilot | FAIL(UNAUTHORIZED:GitHub Copilot requires login at github.com/copilot) |
| 121 | chats_export | copilot | FAIL(-32001:MCP error -32001: Request timed out) |
| 122 | chat_cache_sync | copilot | FAIL(HOST_ERROR:Navigation rejected.) |
| 123 | chat_cache_read | copilot | FAIL(NOT_FOUND:cached chat not found) |
| 124 | chat_cache_append | copilot | FAIL(NOT_FOUND:cached chat not found) |
| 125 | chat_cache_update_block | copilot | FAIL(NOT_FOUND:cached chat not found) |
| 126 | chats_search | copilot | PASS |
| 127 | tabs_search | copilot | PASS |
| 128 | jobs_enqueue | copilot | FAIL(TIMEOUT:job timeout) |
| 129 | jobs_status | copilot | PASS |
| 130 | jobs_list | copilot | PASS |
| 131 | jobs_enqueue | copilot | FAIL(TIMEOUT:job timeout) |
| 132 | jobs_enqueue | copilot | FAIL(TIMEOUT:job timeout) |
| 133 | projects_list | copilot | PASS |
| 134 | projects_create | copilot | FAIL(BAD_REQUEST:matches no oneOf branch) |
| 135 | projects_chats | copilot | SKIP(missing slots: containerId) |
| 136 | projects_move_chat | copilot | SKIP(missing slots: containerId) |
| 137 | projects_delete | copilot | SKIP(missing slots: containerId) |
| 138 | chats_create | copilot | FAIL(-32001:MCP error -32001: Request timed out) |
| 139 | jobs_enqueue | copilot | FAIL(TIMEOUT:job timeout) |
| 140 | chats_delete | copilot | PASS |
| 141 | chats_create | copilot | FAIL(-32001:MCP error -32001: Request timed out) |
| 142 | jobs_enqueue | copilot | FAIL(TIMEOUT:job timeout) |
| 143 | chat_cache_delete | copilot | PASS |
| 144 | platforms_list | claude | PASS |
| 145 | tabs_ensure | claude | PASS |
| 146 | platforms_status | claude | PASS |
| 147 | platforms_capabilities | claude | PASS |
| 148 | chats_list | claude | FAIL(-32001:MCP error -32001: Request timed out) |
| 149 | chats_create | claude | FAIL(-32001:MCP error -32001: Request timed out) |
| 150 | chats_send | claude | FAIL(-32001:MCP error -32001: Request timed out) |
| 151 | chat_ask | claude | FAIL(-32001:MCP error -32001: Request timed out) |
| 152 | chats_get | claude | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 153 | chat_outline | claude | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 154 | chat_read | claude | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 155 | chats_export | claude | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 156 | chat_cache_sync | claude | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 157 | chat_cache_read | claude | PASS |
| 158 | chat_cache_append | claude | PASS |
| 159 | chat_cache_update_block | claude | FAIL(NOT_FOUND:cache block not found at turnIndex 0) |
| 160 | chats_search | claude | PASS |
| 161 | tabs_search | claude | PASS |
| 162 | jobs_enqueue | claude | FAIL(TIMEOUT:job timeout) |
| 163 | jobs_status | claude | PASS |
| 164 | jobs_list | claude | PASS |
| 165 | jobs_enqueue | claude | FAIL(TIMEOUT:job timeout) |
| 166 | jobs_enqueue | claude | FAIL(TIMEOUT:job timeout) |
| 167 | projects_list | claude | PASS |
| 168 | projects_create | claude | SKIP(unsupported:-32001) |
| 169 | projects_chats | claude | SKIP(missing slots: containerId) |
| 170 | projects_move_chat | claude | SKIP(missing slots: containerId) |
| 171 | projects_delete | claude | SKIP(missing slots: containerId) |
| 172 | chats_create | claude | FAIL(-32001:MCP error -32001: Request timed out) |
| 173 | jobs_enqueue | claude | FAIL(TIMEOUT:job timeout) |
| 174 | chats_delete | claude | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 175 | chats_create | claude | FAIL(-32001:MCP error -32001: Request timed out) |
| 176 | jobs_enqueue | claude | FAIL(TIMEOUT:job timeout) |
| 177 | chat_cache_delete | claude | PASS |
| 178 | platforms_list | qwen | PASS |
| 179 | tabs_ensure | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 180 | platforms_status | qwen | PASS |
| 181 | platforms_capabilities | qwen | PASS |
| 182 | chats_list | qwen | PASS |
| 183 | chats_create | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 184 | chats_send | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 185 | chat_ask | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 186 | chats_get | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 187 | chat_outline | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 188 | chat_read | qwen | FAIL(NOT_FOUND:Этот диалог был удален. Перенаправление на главную страницу через 3 секунды.) |
| 189 | chats_export | qwen | FAIL(NOT_FOUND:Этот диалог был удален. Перенаправление на главную страницу через 3 секунды.) |
| 190 | chat_cache_sync | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 191 | chat_cache_read | qwen | FAIL(NOT_FOUND:cached chat not found) |
| 192 | chat_cache_append | qwen | FAIL(NOT_FOUND:cached chat not found) |
| 193 | chat_cache_update_block | qwen | FAIL(NOT_FOUND:cached chat not found) |
| 194 | chats_search | qwen | PASS |
| 195 | tabs_search | qwen | PASS |
| 196 | jobs_enqueue | qwen | FAIL(TIMEOUT:job timeout) |
| 197 | jobs_status | qwen | PASS |
| 198 | jobs_list | qwen | PASS |
| 199 | jobs_enqueue | qwen | FAIL(TIMEOUT:job timeout) |
| 200 | jobs_enqueue | qwen | FAIL(TIMEOUT:job timeout) |
| 201 | projects_list | qwen | PASS |
| 202 | projects_create | qwen | SKIP(unsupported:HOST_ERROR) |
| 203 | projects_chats | qwen | SKIP(missing slots: containerId) |
| 204 | projects_move_chat | qwen | SKIP(missing slots: containerId) |
| 205 | projects_delete | qwen | SKIP(missing slots: containerId) |
| 206 | chats_create | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 207 | jobs_enqueue | qwen | FAIL(TIMEOUT:job timeout) |
| 208 | chats_delete | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 209 | chats_create | qwen | FAIL(-32001:MCP error -32001: Request timed out) |
| 210 | jobs_enqueue | qwen | FAIL(TIMEOUT:job timeout) |
| 211 | chat_cache_delete | qwen | FAIL(NOT_FOUND:cached chat not found) |
| 212 | platforms_list | deepseek | PASS |
| 213 | tabs_ensure | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 214 | platforms_status | deepseek | PASS |
| 215 | platforms_capabilities | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 216 | chats_list | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 217 | chats_create | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 218 | chats_send | deepseek | FAIL(HOST_ERROR:composer not found) |
| 219 | chat_ask | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 220 | chats_get | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 221 | chat_outline | deepseek | FAIL(UNAUTHORIZED:get INVALID_TOKEN) |
| 222 | chat_read | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 223 | chats_export | deepseek | FAIL(HOST_ERROR:get invalid chat session id) |
| 224 | chat_cache_sync | deepseek | FAIL(UNAUTHORIZED:get INVALID_TOKEN) |
| 225 | chat_cache_read | deepseek | FAIL(NOT_FOUND:cached chat not found) |
| 226 | chat_cache_append | deepseek | FAIL(NOT_FOUND:cached chat not found) |
| 227 | chat_cache_update_block | deepseek | FAIL(NOT_FOUND:cached chat not found) |
| 228 | chats_search | deepseek | PASS |
| 229 | tabs_search | deepseek | PASS |
| 230 | jobs_enqueue | deepseek | FAIL(TIMEOUT:job timeout) |
| 231 | jobs_status | deepseek | PASS |
| 232 | jobs_list | deepseek | PASS |
| 233 | jobs_enqueue | deepseek | FAIL(TIMEOUT:job timeout) |
| 234 | jobs_enqueue | deepseek | FAIL(TIMEOUT:job timeout) |
| 235 | projects_list | deepseek | PASS |
| 236 | projects_create | deepseek | SKIP(unsupported:HOST_ERROR) |
| 237 | projects_chats | deepseek | SKIP(missing slots: containerId) |
| 238 | projects_move_chat | deepseek | SKIP(missing slots: containerId) |
| 239 | projects_delete | deepseek | SKIP(missing slots: containerId) |
| 240 | chats_create | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 241 | jobs_enqueue | deepseek | FAIL(TIMEOUT:job timeout) |
| 242 | chats_delete | deepseek | FAIL(UNAUTHORIZED:delete INVALID_TOKEN) |
| 243 | chats_create | deepseek | FAIL(HOST_ERROR:deepseek tab navigated away during chats.create (page reload / bfcache); result unknown) |
| 244 | jobs_enqueue | deepseek | FAIL(TIMEOUT:job timeout) |
| 245 | chat_cache_delete | deepseek | FAIL(NOT_FOUND:cached chat not found) |
| 246 | platforms_list | perplexity | PASS |
| 247 | tabs_ensure | perplexity | PASS |
| 248 | platforms_status | perplexity | PASS |
| 249 | platforms_capabilities | perplexity | PASS |
| 250 | chats_list | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 251 | chats_create | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 252 | chats_send | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 253 | chat_ask | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 254 | chats_get | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 255 | chat_outline | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 256 | chat_read | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 257 | chats_export | perplexity | FAIL(UNAUTHORIZED:thread not available via API) |
| 258 | chat_cache_sync | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 259 | chat_cache_read | perplexity | FAIL(NOT_FOUND:cached chat not found) |
| 260 | chat_cache_append | perplexity | FAIL(NOT_FOUND:cached chat not found) |
| 261 | chat_cache_update_block | perplexity | FAIL(NOT_FOUND:cached chat not found) |
| 262 | chats_search | perplexity | PASS |
| 263 | tabs_search | perplexity | PASS |
| 264 | jobs_enqueue | perplexity | FAIL(TIMEOUT:job timeout) |
| 265 | jobs_status | perplexity | PASS |
| 266 | jobs_list | perplexity | PASS |
| 267 | jobs_enqueue | perplexity | FAIL(TIMEOUT:job timeout) |
| 268 | jobs_enqueue | perplexity | FAIL(TIMEOUT:job timeout) |
| 269 | projects_list | perplexity | PASS |
| 270 | projects_create | perplexity | SKIP(unsupported:HOST_ERROR) |
| 271 | projects_chats | perplexity | SKIP(missing slots: containerId) |
| 272 | projects_move_chat | perplexity | SKIP(missing slots: containerId) |
| 273 | projects_delete | perplexity | SKIP(missing slots: containerId) |
| 274 | chats_create | perplexity | FAIL(RATE_LIMIT:Перейти на Pro) |
| 275 | jobs_enqueue | perplexity | FAIL(TIMEOUT:job timeout) |
| 276 | chats_delete | perplexity | FAIL(-32001:MCP error -32001: Request timed out) |
| 277 | chats_create | perplexity | FAIL(RATE_LIMIT:Перейти на Pro) |
| 278 | jobs_enqueue | perplexity | FAIL(TIMEOUT:job timeout) |
| 279 | chat_cache_delete | perplexity | FAIL(NOT_FOUND:cached chat not found) |
| 280 | platforms_list | kimi | PASS |
| 281 | tabs_ensure | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 282 | platforms_status | kimi | PASS |
| 283 | platforms_capabilities | kimi | PASS |
| 284 | chats_list | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 285 | chats_create | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 286 | chats_send | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 287 | chat_ask | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 288 | chats_get | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 289 | chat_outline | kimi | PASS |
| 290 | chat_read | kimi | PASS |
| 291 | chats_export | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 292 | chat_cache_sync | kimi | PASS |
| 293 | chat_cache_read | kimi | PASS |
| 294 | chat_cache_append | kimi | PASS |
| 295 | chat_cache_update_block | kimi | FAIL(NOT_FOUND:cache block not found at turnIndex 0) |
| 296 | chats_search | kimi | PASS |
| 297 | tabs_search | kimi | PASS |
| 298 | jobs_enqueue | kimi | FAIL(TIMEOUT:job timeout) |
| 299 | jobs_status | kimi | PASS |
| 300 | jobs_list | kimi | PASS |
| 301 | jobs_enqueue | kimi | FAIL(TIMEOUT:job timeout) |
| 302 | jobs_enqueue | kimi | FAIL(TIMEOUT:job timeout) |
| 303 | projects_list | kimi | PASS |
| 304 | projects_create | kimi | SKIP(unsupported:HOST_ERROR) |
| 305 | projects_chats | kimi | SKIP(missing slots: containerId) |
| 306 | projects_move_chat | kimi | SKIP(missing slots: containerId) |
| 307 | projects_delete | kimi | SKIP(missing slots: containerId) |
| 308 | chats_create | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 309 | jobs_enqueue | kimi | FAIL(TIMEOUT:job timeout) |
| 310 | chats_delete | kimi | FAIL(HOST_ERROR:Kimi delete unavailable — ChatService/UI delete not found for: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 311 | chats_create | kimi | FAIL(-32001:MCP error -32001: Request timed out) |
| 312 | jobs_enqueue | kimi | FAIL(TIMEOUT:job timeout) |
| 313 | chat_cache_delete | kimi | PASS |
| 314 | platforms_list | zai | PASS |
| 315 | tabs_ensure | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 316 | platforms_status | zai | PASS |
| 317 | platforms_capabilities | zai | PASS |
| 318 | chats_list | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 319 | chats_create | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 320 | chats_send | zai | PASS |
| 321 | chat_ask | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 322 | chats_get | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 323 | chat_outline | zai | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 324 | chat_read | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 325 | chats_export | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 326 | chat_cache_sync | zai | FAIL(NOT_FOUND:conversation not found: f3f1c1a3-6b74-44c1-9980-602a1b056d05) |
| 327 | chat_cache_read | zai | FAIL(NOT_FOUND:cached chat not found) |
| 328 | chat_cache_append | zai | FAIL(NOT_FOUND:cached chat not found) |
| 329 | chat_cache_update_block | zai | FAIL(NOT_FOUND:cached chat not found) |
| 330 | chats_search | zai | PASS |
| 331 | tabs_search | zai | PASS |
| 332 | jobs_enqueue | zai | FAIL(TIMEOUT:job timeout) |
| 333 | jobs_status | zai | PASS |
| 334 | jobs_list | zai | PASS |
| 335 | jobs_enqueue | zai | FAIL(TIMEOUT:job timeout) |
| 336 | jobs_enqueue | zai | FAIL(TIMEOUT:job timeout) |
| 337 | projects_list | zai | PASS |
| 338 | projects_create | zai | SKIP(unsupported:HOST_ERROR) |
| 339 | projects_chats | zai | SKIP(missing slots: containerId) |
| 340 | projects_move_chat | zai | SKIP(missing slots: containerId) |
| 341 | projects_delete | zai | SKIP(missing slots: containerId) |
| 342 | chats_create | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 343 | jobs_enqueue | zai | FAIL(TIMEOUT:job timeout) |
| 344 | chats_delete | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 345 | chats_create | zai | FAIL(-32001:MCP error -32001: Request timed out) |
| 346 | jobs_enqueue | zai | FAIL(TIMEOUT:job timeout) |
| 347 | chat_cache_delete | zai | PASS |
| 348 | platforms_list | minimax | PASS |
| 349 | tabs_ensure | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 350 | platforms_status | minimax | PASS |
| 351 | platforms_capabilities | minimax | PASS |
| 352 | chats_list | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 353 | chats_create | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 354 | chats_send | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 355 | chat_ask | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 356 | chats_get | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 357 | chat_outline | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 358 | chat_read | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 359 | chats_export | minimax | PASS |
| 360 | chat_cache_sync | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 361 | chat_cache_read | minimax | FAIL(NOT_FOUND:cached chat not found) |
| 362 | chat_cache_append | minimax | FAIL(NOT_FOUND:cached chat not found) |
| 363 | chat_cache_update_block | minimax | FAIL(NOT_FOUND:cached chat not found) |
| 364 | chats_search | minimax | PASS |
| 365 | tabs_search | minimax | PASS |
| 366 | jobs_enqueue | minimax | FAIL(ok:0 failed:1 UNAUTHORIZED) |
| 367 | jobs_status | minimax | PASS |
| 368 | jobs_list | minimax | PASS |
| 369 | jobs_enqueue | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 370 | jobs_enqueue | minimax | PASS |
| 371 | projects_list | minimax | PASS |
| 372 | projects_create | minimax | SKIP(unsupported:HOST_ERROR) |
| 373 | projects_chats | minimax | SKIP(missing slots: containerId) |
| 374 | projects_move_chat | minimax | SKIP(missing slots: containerId) |
| 375 | projects_delete | minimax | SKIP(missing slots: containerId) |
| 376 | chats_create | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 377 | jobs_enqueue | minimax | FAIL(DESTRUCTIVE_DISABLED:testOnly: chat title does not start with [ce-test]) |
| 378 | chats_delete | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 379 | chats_create | minimax | FAIL(UNAUTHORIZED:MiniMax Agent requires sign-in) |
| 380 | jobs_enqueue | minimax | FAIL(ok:0 failed:1 DESTRUCTIVE_DISABLED) |
| 381 | chat_cache_delete | minimax | FAIL(NOT_FOUND:cached chat not found) |
| 382 | jobs_enqueue | perplexity | PASS |
| 383 | jobs_cancel | perplexity | PASS |
