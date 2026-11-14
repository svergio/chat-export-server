# MCP run-list RUN

- Started: 2026-11-14T16:52:55.414Z
- Browser: b-215c6f46

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
| 012 | chats_list | chatgpt | PASS |
| 013 | chats_create | chatgpt | PASS |
| 014 | chats_send | chatgpt | PASS |
| 015 | chat_ask | chatgpt | PASS |
| 016 | chats_get | chatgpt | PASS |
| 017 | chat_outline | chatgpt | PASS |
| 018 | chat_read | chatgpt | PASS |
| 019 | chats_export | chatgpt | PASS |
| 020 | chat_cache_sync | chatgpt | PASS |
| 021 | chat_cache_read | chatgpt | PASS |
| 022 | chat_cache_append | chatgpt | PASS |
| 023 | chat_cache_update_block | chatgpt | PASS |
| 024 | chats_search | chatgpt | PASS |
| 025 | tabs_search | chatgpt | PASS |
| 026 | jobs_enqueue | chatgpt | PASS |
| 027 | jobs_status | chatgpt | PASS |
| 028 | jobs_list | chatgpt | PASS |
| 029 | jobs_enqueue | chatgpt | PASS |
| 030 | jobs_enqueue | chatgpt | PASS |
| 031 | projects_list | chatgpt | PASS |
| 032 | projects_create | chatgpt | PASS |
| 033 | projects_chats | chatgpt | PASS |
| 034 | projects_move_chat | chatgpt | PASS |
| 035 | projects_delete | chatgpt | PASS |
| 036 | chats_create | chatgpt | FAIL(HOST_ERROR:ChatGPT chatId timeout) |
| 037 | jobs_enqueue | chatgpt | FAIL(missing slots: chatId2) |
| 038 | chats_delete | chatgpt | FAIL(NOT_FOUND:conversation not found: 6af891eb-7da8-83ed-91ef-41c64da9e535) |
| 039 | chats_create | chatgpt | FAIL(HOST_ERROR:ChatGPT chatId timeout) |
| 040 | jobs_enqueue | chatgpt | FAIL(missing slots: chatId3) |
| 041 | chat_cache_delete | chatgpt | PASS |
| 042 | platforms_list | grok | PASS |
| 043 | tabs_ensure | grok | PASS |
| 044 | platforms_status | grok | PASS |
| 045 | platforms_capabilities | grok | PASS |
| 046 | chats_list | grok | PASS |
| 047 | chats_create | grok | PASS |
| 048 | chats_send | grok | PASS |
| 049 | chat_ask | grok | FAIL(TIMEOUT:chat_ask wait timed out) |
| 050 | chats_get | grok | PASS |
| 051 | chat_outline | grok | PASS |
| 052 | chat_read | grok | PASS |
| 053 | chats_export | grok | PASS |
| 054 | chat_cache_sync | grok | PASS |
| 055 | chat_cache_read | grok | PASS |
| 056 | chat_cache_append | grok | PASS |
| 057 | chat_cache_update_block | grok | PASS |
| 058 | chats_search | grok | PASS |
| 059 | tabs_search | grok | PASS |
| 060 | jobs_enqueue | grok | FAIL(TIMEOUT:job timeout) |
| 061 | jobs_status | grok | PASS |
| 062 | jobs_list | grok | PASS |
| 063 | jobs_enqueue | grok | PASS |
| 064 | jobs_enqueue | grok | PASS |
| 065 | projects_list | grok | PASS |
| 066 | projects_create | grok | SKIP(unsupported:HOST_ERROR) |
| 067 | projects_chats | grok | SKIP(missing slots: containerId) |
| 068 | projects_move_chat | grok | SKIP(missing slots: containerId) |
| 069 | projects_delete | grok | SKIP(missing slots: containerId) |
| 070 | chats_create | grok | PASS |
| 071 | jobs_enqueue | grok | PASS |
| 072 | chats_delete | grok | PASS |
| 073 | chats_create | grok | PASS |
| 074 | jobs_enqueue | grok | PASS |
| 075 | chat_cache_delete | grok | PASS |
| 076 | platforms_list | grok-x | PASS |
| 077 | tabs_ensure | grok-x | PASS |
| 078 | platforms_status | grok-x | PASS |
| 079 | platforms_capabilities | grok-x | PASS |
| 080 | chats_list | grok-x | PASS |
| 081 | chats_create | grok-x | PASS |
| 082 | chats_send | grok-x | PASS |
| 083 | chat_ask | grok-x | PASS |
| 084 | chats_get | grok-x | PASS |
| 085 | chat_outline | grok-x | PASS |
| 086 | chat_read | grok-x | PASS |
| 087 | chats_export | grok-x | PASS |
| 088 | chat_cache_sync | grok-x | PASS |
| 089 | chat_cache_read | grok-x | PASS |
| 090 | chat_cache_append | grok-x | PASS |
| 091 | chat_cache_update_block | grok-x | PASS |
| 092 | chats_search | grok-x | PASS |
| 093 | tabs_search | grok-x | PASS |
| 094 | jobs_enqueue | grok-x | PASS |
| 095 | jobs_status | grok-x | PASS |
| 096 | jobs_list | grok-x | PASS |
| 097 | jobs_enqueue | grok-x | PASS |
| 098 | jobs_enqueue | grok-x | PASS |
| 099 | projects_list | grok-x | PASS |
| 100 | projects_create | grok-x | SKIP(unsupported:PROJECTS_DISABLED) |
| 101 | projects_chats | grok-x | SKIP(missing slots: containerId) |
| 102 | projects_move_chat | grok-x | SKIP(missing slots: containerId) |
| 103 | projects_delete | grok-x | SKIP(missing slots: containerId) |
| 104 | chats_create | grok-x | PASS |
| 105 | jobs_enqueue | grok-x | PASS |
| 106 | chats_delete | grok-x | PASS |
| 107 | chats_create | grok-x | PASS |
| 108 | jobs_enqueue | grok-x | PASS |
| 109 | chat_cache_delete | grok-x | PASS |
| 110 | platforms_list | copilot | PASS |
| 111 | tabs_ensure | copilot | PASS |
| 112 | platforms_status | copilot | PASS |
| 113 | platforms_capabilities | copilot | PASS |
| 114 | chats_list | copilot | PASS |
| 115 | chats_create | copilot | PASS |
| 116 | chats_send | copilot | PASS |
| 117 | chat_ask | copilot | PASS |
| 118 | chats_get | copilot | PASS |
| 119 | chat_outline | copilot | PASS |
| 120 | chat_read | copilot | PASS |
| 121 | chats_export | copilot | PASS |
| 122 | chat_cache_sync | copilot | PASS |
| 123 | chat_cache_read | copilot | PASS |
| 124 | chat_cache_append | copilot | PASS |
| 125 | chat_cache_update_block | copilot | PASS |
| 126 | chats_search | copilot | PASS |
| 127 | tabs_search | copilot | PASS |
| 128 | jobs_enqueue | copilot | PASS |
| 129 | jobs_status | copilot | PASS |
| 130 | jobs_list | copilot | PASS |
| 131 | jobs_enqueue | copilot | PASS |
| 132 | jobs_enqueue | copilot | PASS |
| 133 | projects_list | copilot | PASS |
| 134 | projects_create | copilot | SKIP(unsupported:PROJECTS_DISABLED) |
| 135 | projects_chats | copilot | SKIP(missing slots: containerId) |
| 136 | projects_move_chat | copilot | SKIP(missing slots: containerId) |
| 137 | projects_delete | copilot | SKIP(missing slots: containerId) |
| 138 | chats_create | copilot | PASS |
| 139 | jobs_enqueue | copilot | FAIL(DESTRUCTIVE_DISABLED:testOnly: chat title does not start with [ce-test]) |
| 140 | chats_delete | copilot | PASS |
| 141 | chats_create | copilot | PASS |
| 142 | jobs_enqueue | copilot | FAIL(ok:0 failed:1 DESTRUCTIVE_DISABLED) |
| 143 | chat_cache_delete | copilot | PASS |
| 144 | platforms_list | claude | PASS |
| 145 | tabs_ensure | claude | PASS |
| 146 | platforms_status | claude | PASS |
| 147 | platforms_capabilities | claude | PASS |
| 148 | chats_list | claude | PASS |
| 149 | chats_create | claude | PASS |
| 150 | chats_send | claude | PASS |
| 151 | chat_ask | claude | PASS |
| 152 | chats_get | claude | PASS |
| 153 | chat_outline | claude | PASS |
| 154 | chat_read | claude | PASS |
| 155 | chats_export | claude | PASS |
| 156 | chat_cache_sync | claude | PASS |
| 157 | chat_cache_read | claude | PASS |
| 158 | chat_cache_append | claude | PASS |
| 159 | chat_cache_update_block | claude | PASS |
| 160 | chats_search | claude | PASS |
| 161 | tabs_search | claude | PASS |
| 162 | jobs_enqueue | claude | PASS |
| 163 | jobs_status | claude | PASS |
| 164 | jobs_list | claude | PASS |
| 165 | jobs_enqueue | claude | PASS |
| 166 | jobs_enqueue | claude | PASS |
| 167 | projects_list | claude | PASS |
| 168 | projects_create | claude | PASS |
| 169 | projects_chats | claude | PASS |
| 170 | projects_move_chat | claude | PASS |
| 171 | projects_delete | claude | PASS |
| 172 | chats_create | claude | PASS |
| 173 | jobs_enqueue | claude | FAIL(DESTRUCTIVE_DISABLED:testOnly: chat title does not start with [ce-test]) |
| 174 | chats_delete | claude | PASS |
| 175 | chats_create | claude | PASS |
| 176 | jobs_enqueue | claude | FAIL(ok:0 failed:1 DESTRUCTIVE_DISABLED) |
| 177 | chat_cache_delete | claude | PASS |
| 178 | platforms_list | qwen | PASS |
| 179 | tabs_ensure | qwen | PASS |
| 180 | platforms_status | qwen | PASS |
| 181 | platforms_capabilities | qwen | FAIL(HOST_ERROR:unauthorized: Token has expired, please log in again.) |
| 182 | chats_list | qwen | PASS |
| 183 | chats_create | qwen | FAIL(HOST_ERROR:Qwen chatId timeout) |
| 184 | chats_send | qwen | FAIL(missing slots: chatId) |
| 185 | chat_ask | qwen | FAIL(missing slots: chatId) |
| 186 | chats_get | qwen | FAIL(missing slots: chatId) |
| 187 | chat_outline | qwen | FAIL(missing slots: chatId) |
| 188 | chat_read | qwen | FAIL(missing slots: chatId) |
| 189 | chats_export | qwen | FAIL(missing slots: chatId) |
| 190 | chat_cache_sync | qwen | FAIL(missing slots: chatId) |
| 191 | chat_cache_read | qwen | FAIL(missing slots: cacheId) |
| 192 | chat_cache_append | qwen | FAIL(missing slots: cacheId) |
| 193 | chat_cache_update_block | qwen | FAIL(missing slots: cacheId) |
| 194 | chats_search | qwen | FAIL(missing slots: chatId) |
| 195 | tabs_search | qwen | PASS |
| 196 | jobs_enqueue | qwen | FAIL(missing slots: chatId) |
| 197 | jobs_status | qwen | PASS |
| 198 | jobs_list | qwen | PASS |
| 199 | jobs_enqueue | qwen | FAIL(missing slots: chatId) |
| 200 | jobs_enqueue | qwen | FAIL(missing slots: chatId) |
| 201 | projects_list | qwen | PASS |
| 202 | projects_create | qwen | SKIP(unsupported:HOST_ERROR) |
| 203 | projects_chats | qwen | SKIP(missing slots: containerId) |
| 204 | projects_move_chat | qwen | SKIP(missing slots: chatId,containerId) |
| 205 | projects_delete | qwen | SKIP(missing slots: containerId) |
| 206 | chats_create | qwen | FAIL(HOST_ERROR:Qwen chatId timeout) |
| 207 | jobs_enqueue | qwen | FAIL(missing slots: chatId2) |
| 208 | chats_delete | qwen | FAIL(missing slots: chatId) |
| 209 | chats_create | qwen | FAIL(HOST_ERROR:Qwen chatId timeout) |
| 210 | jobs_enqueue | qwen | FAIL(missing slots: chatId3) |
| 211 | chat_cache_delete | qwen | SKIP(missing slots: cacheId) |
| 212 | platforms_list | deepseek | PASS |
| 213 | tabs_ensure | deepseek | PASS |
| 214 | platforms_status | deepseek | PASS |
| 215 | platforms_capabilities | deepseek | PASS |
| 216 | chats_list | deepseek | PASS |
| 217 | chats_create | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 218 | chats_send | deepseek | FAIL(missing slots: chatId) |
| 219 | chat_ask | deepseek | FAIL(missing slots: chatId) |
| 220 | chats_get | deepseek | FAIL(missing slots: chatId) |
| 221 | chat_outline | deepseek | FAIL(missing slots: chatId) |
| 222 | chat_read | deepseek | FAIL(missing slots: chatId) |
| 223 | chats_export | deepseek | FAIL(missing slots: chatId) |
| 224 | chat_cache_sync | deepseek | FAIL(missing slots: chatId) |
| 225 | chat_cache_read | deepseek | FAIL(missing slots: cacheId) |
| 226 | chat_cache_append | deepseek | FAIL(missing slots: cacheId) |
| 227 | chat_cache_update_block | deepseek | FAIL(missing slots: cacheId) |
| 228 | chats_search | deepseek | FAIL(missing slots: chatId) |
| 229 | tabs_search | deepseek | PASS |
| 230 | jobs_enqueue | deepseek | FAIL(missing slots: chatId) |
| 231 | jobs_status | deepseek | PASS |
| 232 | jobs_list | deepseek | PASS |
| 233 | jobs_enqueue | deepseek | FAIL(missing slots: chatId) |
| 234 | jobs_enqueue | deepseek | FAIL(missing slots: chatId) |
| 235 | projects_list | deepseek | PASS |
| 236 | projects_create | deepseek | SKIP(unsupported:HOST_ERROR) |
| 237 | projects_chats | deepseek | SKIP(missing slots: containerId) |
| 238 | projects_move_chat | deepseek | SKIP(missing slots: chatId,containerId) |
| 239 | projects_delete | deepseek | SKIP(missing slots: containerId) |
| 240 | chats_create | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 241 | jobs_enqueue | deepseek | FAIL(missing slots: chatId2) |
| 242 | chats_delete | deepseek | FAIL(missing slots: chatId) |
| 243 | chats_create | deepseek | FAIL(-32001:MCP error -32001: Request timed out) |
| 244 | jobs_enqueue | deepseek | FAIL(missing slots: chatId3) |
| 245 | chat_cache_delete | deepseek | SKIP(missing slots: cacheId) |
| 246 | platforms_list | perplexity | PASS |
| 247 | tabs_ensure | perplexity | PASS |
| 248 | platforms_status | perplexity | PASS |
| 249 | platforms_capabilities | perplexity | PASS |
| 250 | chats_list | perplexity | PASS |
| 251 | chats_create | perplexity | FAIL(RATE_LIMIT:Перейти на Pro) |
| 252 | chats_send | perplexity | FAIL(missing slots: chatId) |
| 253 | chat_ask | perplexity | FAIL(missing slots: chatId) |
| 254 | chats_get | perplexity | FAIL(missing slots: chatId) |
| 255 | chat_outline | perplexity | FAIL(missing slots: chatId) |
| 256 | chat_read | perplexity | FAIL(missing slots: chatId) |
| 257 | chats_export | perplexity | FAIL(missing slots: chatId) |
| 258 | chat_cache_sync | perplexity | FAIL(missing slots: chatId) |
| 259 | chat_cache_read | perplexity | FAIL(missing slots: cacheId) |
| 260 | chat_cache_append | perplexity | FAIL(missing slots: cacheId) |
| 261 | chat_cache_update_block | perplexity | FAIL(missing slots: cacheId) |
| 262 | chats_search | perplexity | FAIL(missing slots: chatId) |
| 263 | tabs_search | perplexity | PASS |
| 264 | jobs_enqueue | perplexity | FAIL(missing slots: chatId) |
| 265 | jobs_status | perplexity | PASS |
| 266 | jobs_list | perplexity | PASS |
| 267 | jobs_enqueue | perplexity | FAIL(missing slots: chatId) |
| 268 | jobs_enqueue | perplexity | FAIL(missing slots: chatId) |
| 269 | projects_list | perplexity | PASS |
| 270 | projects_create | perplexity | SKIP(unsupported:HOST_ERROR) |
| 271 | projects_chats | perplexity | SKIP(missing slots: containerId) |
| 272 | projects_move_chat | perplexity | SKIP(missing slots: chatId,containerId) |
| 273 | projects_delete | perplexity | SKIP(missing slots: containerId) |
| 274 | chats_create | perplexity | FAIL(RATE_LIMIT:Перейти на Pro) |
| 275 | jobs_enqueue | perplexity | FAIL(missing slots: chatId2) |
| 276 | chats_delete | perplexity | FAIL(missing slots: chatId) |
| 277 | chats_create | perplexity | PASS |
| 278 | jobs_enqueue | perplexity | FAIL(ok:0 failed:1 NOT_FOUND) |
| 279 | chat_cache_delete | perplexity | SKIP(missing slots: cacheId) |
| 280 | platforms_list | kimi | PASS |
| 281 | tabs_ensure | kimi | PASS |
| 282 | platforms_status | kimi | PASS |
| 283 | platforms_capabilities | kimi | PASS |
| 284 | chats_list | kimi | PASS |
| 285 | chats_create | kimi | FAIL(HOST_ERROR:Kimi chatId timeout) |
| 286 | chats_send | kimi | FAIL(missing slots: chatId) |
| 287 | chat_ask | kimi | FAIL(missing slots: chatId) |
| 288 | chats_get | kimi | FAIL(missing slots: chatId) |
| 289 | chat_outline | kimi | FAIL(missing slots: chatId) |
| 290 | chat_read | kimi | FAIL(missing slots: chatId) |
| 291 | chats_export | kimi | FAIL(missing slots: chatId) |
| 292 | chat_cache_sync | kimi | FAIL(missing slots: chatId) |
| 293 | chat_cache_read | kimi | FAIL(missing slots: cacheId) |
| 294 | chat_cache_append | kimi | FAIL(missing slots: cacheId) |
| 295 | chat_cache_update_block | kimi | FAIL(missing slots: cacheId) |
| 296 | chats_search | kimi | FAIL(missing slots: chatId) |
| 297 | tabs_search | kimi | PASS |
| 298 | jobs_enqueue | kimi | FAIL(missing slots: chatId) |
| 299 | jobs_status | kimi | PASS |
| 300 | jobs_list | kimi | PASS |
| 301 | jobs_enqueue | kimi | FAIL(missing slots: chatId) |
| 302 | jobs_enqueue | kimi | FAIL(missing slots: chatId) |
| 303 | projects_list | kimi | PASS |
| 304 | projects_create | kimi | SKIP(unsupported:HOST_ERROR) |
| 305 | projects_chats | kimi | SKIP(missing slots: containerId) |
| 306 | projects_move_chat | kimi | SKIP(missing slots: chatId,containerId) |
| 307 | projects_delete | kimi | SKIP(missing slots: containerId) |
| 308 | chats_create | kimi | FAIL(HOST_ERROR:Kimi chatId timeout) |
| 309 | jobs_enqueue | kimi | FAIL(missing slots: chatId2) |
| 310 | chats_delete | kimi | FAIL(missing slots: chatId) |
| 311 | chats_create | kimi | FAIL(HOST_ERROR:Kimi chatId timeout) |
| 312 | jobs_enqueue | kimi | FAIL(missing slots: chatId3) |
| 313 | chat_cache_delete | kimi | SKIP(missing slots: cacheId) |
| 314 | platforms_list | zai | PASS |
| 315 | tabs_ensure | zai | PASS |
| 316 | platforms_status | zai | PASS |
| 317 | platforms_capabilities | zai | PASS |
| 318 | chats_list | zai | PASS |
| 319 | chats_create | zai | FAIL(HOST_ERROR:Z.ai chatId timeout) |
| 320 | chats_send | zai | FAIL(missing slots: chatId) |
| 321 | chat_ask | zai | FAIL(missing slots: chatId) |
| 322 | chats_get | zai | FAIL(missing slots: chatId) |
| 323 | chat_outline | zai | FAIL(missing slots: chatId) |
| 324 | chat_read | zai | FAIL(missing slots: chatId) |
| 325 | chats_export | zai | FAIL(missing slots: chatId) |
| 326 | chat_cache_sync | zai | FAIL(missing slots: chatId) |
| 327 | chat_cache_read | zai | FAIL(missing slots: cacheId) |
| 328 | chat_cache_append | zai | FAIL(missing slots: cacheId) |
| 329 | chat_cache_update_block | zai | FAIL(missing slots: cacheId) |
| 330 | chats_search | zai | FAIL(missing slots: chatId) |
| 331 | tabs_search | zai | PASS |
| 332 | jobs_enqueue | zai | FAIL(missing slots: chatId) |
| 333 | jobs_status | zai | PASS |
| 334 | jobs_list | zai | PASS |
| 335 | jobs_enqueue | zai | FAIL(missing slots: chatId) |
| 336 | jobs_enqueue | zai | FAIL(missing slots: chatId) |
| 337 | projects_list | zai | PASS |
| 338 | projects_create | zai | SKIP(unsupported:HOST_ERROR) |
| 339 | projects_chats | zai | SKIP(missing slots: containerId) |
| 340 | projects_move_chat | zai | SKIP(missing slots: chatId,containerId) |
| 341 | projects_delete | zai | SKIP(missing slots: containerId) |
| 342 | chats_create | zai | FAIL(HOST_ERROR:Z.ai chatId timeout) |
| 343 | jobs_enqueue | zai | FAIL(missing slots: chatId2) |
| 344 | chats_delete | zai | FAIL(missing slots: chatId) |
| 345 | chats_create | zai | FAIL(HOST_ERROR:Z.ai chatId timeout) |
| 346 | jobs_enqueue | zai | FAIL(missing slots: chatId3) |
| 347 | chat_cache_delete | zai | SKIP(missing slots: cacheId) |
| 348 | platforms_list | minimax | PASS |
| 349 | tabs_ensure | minimax | PASS |
| 350 | platforms_status | minimax | PASS |
| 351 | platforms_capabilities | minimax | PASS |
| 352 | chats_list | minimax | PASS |
| 353 | chats_create | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 354 | chats_send | minimax | FAIL(missing slots: chatId) |
| 355 | chat_ask | minimax | FAIL(missing slots: chatId) |
| 356 | chats_get | minimax | FAIL(missing slots: chatId) |
| 357 | chat_outline | minimax | FAIL(missing slots: chatId) |
| 358 | chat_read | minimax | FAIL(missing slots: chatId) |
| 359 | chats_export | minimax | FAIL(missing slots: chatId) |
| 360 | chat_cache_sync | minimax | FAIL(missing slots: chatId) |
| 361 | chat_cache_read | minimax | FAIL(missing slots: cacheId) |
| 362 | chat_cache_append | minimax | FAIL(missing slots: cacheId) |
| 363 | chat_cache_update_block | minimax | FAIL(missing slots: cacheId) |
| 364 | chats_search | minimax | FAIL(missing slots: chatId) |
| 365 | tabs_search | minimax | PASS |
| 366 | jobs_enqueue | minimax | FAIL(missing slots: chatId) |
| 367 | jobs_status | minimax | PASS |
| 368 | jobs_list | minimax | PASS |
| 369 | jobs_enqueue | minimax | FAIL(missing slots: chatId) |
| 370 | jobs_enqueue | minimax | FAIL(missing slots: chatId) |
| 371 | projects_list | minimax | PASS |
| 372 | projects_create | minimax | SKIP(unsupported:HOST_ERROR) |
| 373 | projects_chats | minimax | SKIP(missing slots: containerId) |
| 374 | projects_move_chat | minimax | SKIP(missing slots: chatId,containerId) |
| 375 | projects_delete | minimax | SKIP(missing slots: containerId) |
| 376 | chats_create | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 377 | jobs_enqueue | minimax | FAIL(missing slots: chatId2) |
| 378 | chats_delete | minimax | FAIL(missing slots: chatId) |
| 379 | chats_create | minimax | FAIL(-32001:MCP error -32001: Request timed out) |
| 380 | jobs_enqueue | minimax | FAIL(missing slots: chatId3) |
| 381 | chat_cache_delete | minimax | SKIP(missing slots: cacheId) |
| 382 | jobs_enqueue | perplexity | PASS |
| 383 | jobs_cancel | perplexity | PASS |
