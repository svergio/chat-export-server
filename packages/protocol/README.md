# @chat-export/protocol (v1)

Wire contract between `chat-export-server` and the Chat Export extension. Every workstream codes against this package. Change it only through W0 and bump `PROTOCOL_VERSION` on breaking changes.

- `src/constants.js` - `PROTOCOL_VERSION`, `PLATFORMS`, `OPS`, `ERROR_CODES`, `EXPORT_FORMATS`, `WS_TYPES`, `CONTENT_RPC_TYPE`
- `src/schema.js` - JSON Schema (2020-12) source with JSDoc typedefs; `schemas/protocol.schema.json` is generated (`npm run schema`)
- `src/index.js` - `validate(defName, value)`, `assertValid`, `validateRpcRequest`, `validateRpcResponse(res, op?)`, `validateOpResult`, `rpcOk`, `rpcError`, `ProtocolError`
- `fixtures/` - sample chat lists, one `ExportPayload` per platform, WS frames, request/response pairs for every op

The validator is a small hand-rolled subset of JSON Schema (no dependencies), so it can be bundled into the extension.

## Constants

| Name | Values |
| --- | --- |
| Platforms | `chatgpt`, `grok`, `grok-x`, `copilot` |
| Export formats | `md`, `yaml`, `json`, `html`, `pdf` |
| Error codes | `PLATFORM_DISABLED`, `NOT_BOUND`, `CONFIRM_REQUIRED`, `DESTRUCTIVE_DISABLED`, `UNAUTHORIZED`, `TIMEOUT`, `HOST_ERROR`, `NOT_FOUND`, `BAD_REQUEST` |

## WebSocket (extension background <-> server, `127.0.0.1`)

The extension connects and sends `hello` first. The server answers `welcome`, or `error` (`UNAUTHORIZED`) and closes.

```text
ext -> srv  { type: 'hello', v: 1, key, browserId, browserLabel, extVersion, platformsEnabled[], allowDestructive? }
srv -> ext  { type: 'welcome', v: 1, browserId, serverVersion, bound }
ext -> srv  { type: 'settings', platformsEnabled[], allowDestructive?, browserLabel? }
srv -> ext  { type: 'error', code, message, id? }
srv -> ext  { type: 'rpc', id, op, platform, args }
ext -> srv  { type: 'rpc.result', id, ok: true, data } | { type: 'rpc.result', id, ok: false, error: { code, message, details? } }
```

## RPC envelope

```text
request   { id, op, platform, args }
response  { id, ok: true, data } | { id, ok: false, error: { code, message, details? } }
```

`type` is optional on both and is used only for framing (`rpc` / `rpc.result` on WS, `chat-export-rpc` for background -> content messages).

## Ops

| op | args | data |
| --- | --- | --- |
| `chats.list` | `{ cursor?: string \| null, limit?: 1..100, query?: string }` | `{ items: Chat[], nextCursor: string \| null }` |
| `chats.get` | `{ chatId }` | `ExportPayload` |
| `chats.export` | `{ chatId, formats: ExportFormat[] }` | `{ files: ExportFile[], payload: ExportPayload }` |
| `chats.create` | `{ text, title? }` | `Chat` |
| `chats.delete` | `{ chatId }` | `{ deleted: true, chatId? }` |

For `chats.get` and `chats.export`, `chatId: ''` means the chat currently open in the host tab. `chats.delete` is the only destructive op: the server requires `confirm: true` (`CONFIRM_REQUIRED`) and `allowDestructive` (`DESTRUCTIVE_DISABLED`) before it forwards the request.

## Models

```text
Chat           { platform, chatId, title, url, updatedAt: ISO | null, createdAt?: ISO | null }
ExportPayload  { platform, url, title, chatId, model, userName, userHandle, userEmail, messages: Message[] }
Message        { role: 'user' | 'assistant' | 'system', roleTag, text, links?: Link[], sources?: Source[] }
Link           { text, href }
Source         { title, url }
ExportFile     { name, mime, text } | { name, mime, b64 }   (pdf is b64, everything else text)
```

`ExportPayload` is the extension's `getData()` result plus `platform` and `url`.

## Error codes

| Code | Raised by | Meaning |
| --- | --- | --- |
| `UNAUTHORIZED` | server | bad or missing key (WS hello or MCP Bearer) |
| `NOT_BOUND` | server | no browser bound or the bound browser is offline |
| `PLATFORM_DISABLED` | server / ext | platform switched off in the popup |
| `CONFIRM_REQUIRED` | server | destructive op called without `confirm: true` |
| `DESTRUCTIVE_DISABLED` | server / ext | `allowDestructive` is off |
| `TIMEOUT` | server | RPC did not answer in time |
| `NOT_FOUND` | ext | chat not found, or the platform adapter is not loaded in the tab |
| `BAD_REQUEST` | server / ext | args failed schema validation or unknown op |
| `HOST_ERROR` | ext | host site failed, or the op is not implemented (`message: 'not implemented'`) |

## Usage

```js
import { validateRpcRequest, validateRpcResponse, rpcError, ERROR_CODES } from '@chat-export/protocol';

const check = validateRpcRequest(req);
if (!check.valid) return rpcError(req.id, ERROR_CODES.BAD_REQUEST, check.errors[0].path + ' ' + check.errors[0].message);
```
