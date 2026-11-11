# chat-export-server

Local MCP server for the Chat Export browser extension. Lists, exports, creates, and deletes your own chats on ChatGPT, Grok, X Grok, and GitHub Copilot through the extension in your browser. Everything stays on `127.0.0.1`.

The server is written in TypeScript (ESM, Node 22.13+). The browser extension stays plain vanilla JS/MV3 and is not part of this build; the wire contract in `packages/protocol` is plain JS and unchanged.

## Install and build

```sh
npm install
npm run build   # tsc -> dist/
npm link        # optional: puts `chat-export-server` on your PATH (bin -> dist/cli/index.js)
```

Requires Node 22.13+ (built-in `node:sqlite`).

| Script | Purpose |
| --- | --- |
| `npm run build` | compile `src/**/*.ts` to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | run the compiled server (`node dist/cli/index.js start`) |
| `npm run dev` | run from TypeScript sources with reload (`tsx watch src/cli/index.ts start`) |
| `npm run mcp` | compiled server with stdio MCP attached |

## Quick start

```sh
# 1) Create a local API key (printed once; only a hash is stored)
chat-export-server key new
# or: node dist/cli/index.js key new

# 2) Start HTTP + WebSocket hub + Streamable MCP
chat-export-server start
# listens on http://127.0.0.1:8765
#   WS   /ws     — extension bridge (canonical)
#   WS   /ext    — alias of /ws (compat)
#   MCP  /mcp    — Authorization: Bearer <key>
#   GET  /health
```

Config and data live under `~/.chat-export` (override with `CHAT_EXPORT_HOME`):

```text
~/.chat-export/
  config.json    # host 127.0.0.1, port, exportDir, settings
  keys.json      # key hashes only (chmod 600)
  audit.log      # append-only audit (MCP/RPC, especially delete)
  exports/       # files from chats_export
```

Other commands:

```sh
chat-export-server key rotate   # revoke previous key, print new one
chat-export-server key list     # fingerprints only
chat-export-server status
```

## Cursor MCP config

### HTTP (server already running)

Put your key in the Bearer header. Do not commit real keys.

```json
{
  "mcpServers": {
    "chat-export": {
      "url": "http://127.0.0.1:8765/mcp",
      "headers": {
        "Authorization": "Bearer cek_YOUR_KEY_HERE"
      }
    }
  }
}
```

### stdio (starts hub in the same process)

```json
{
  "mcpServers": {
    "chat-export": {
      "command": "chat-export-server",
      "args": ["start", "--stdio"],
      "env": {
        "CHAT_EXPORT_HOME": "/Users/YOU/.chat-export"
      }
    }
  }
}
```

From this repo without linking:

```json
{
  "mcpServers": {
    "chat-export": {
      "command": "node",
      "args": [
        "/ABS/PATH/projects/chat-export-server/dist/cli/index.js",
        "start",
        "--stdio"
      ]
    }
  }
}
```

## MCP tools

| Tool | Purpose |
| --- | --- |
| `browsers_list` | Connected Chrome profiles (extension WS) |
| `browsers_bind` | Select which browser subsequent ops use |
| `browsers_status` | Bound browser + online state |
| `platforms_list` | Server/browser platform enablement |
| `chats_list` | List chats (`platform`, optional `cursor` / `limit` / `query`) |
| `chats_get` | Fetch one chat as `ExportPayload` |
| `chats_export` | Export via extension builders; server writes under `exportDir` and returns paths |
| `chats_create` | Create a chat (UI drive in the browser) |
| `chats_delete` | Delete a chat — requires `confirm: true` and `allowDestructive` |

## Layout

```text
packages/protocol/   wire contract v1 (schemas, fixtures) — frozen
packages/faq.md      shared FAQ wording
src/core/            config, keys, settings gates, audit, export files, db, jobs, chat cache
src/hub/             WS BrowserHub (bind, RPC timeouts)
src/mcp/             MCP tools + stdio + HTTP Streamable
src/cli/             chat-export-server CLI
src/dashboard-api.ts /dashboard/api + static files from dashboard/public (submodule)
src/protocol.d.ts    local typings for the plain-JS @chat-export/protocol package
dist/                tsc output (gitignored)
```

## Development

```sh
npm install
npm run typecheck
npm run build
npm run dev
```

`dashboard/` is a git submodule (React + Vite UI built to `dashboard/public`); the server only serves those static files, so run `git submodule update --init` after cloning.

## FAQ

- The extension and server run **only locally** on your computer. There is no telemetry and no external servers; your data is not sent anywhere else.
- Only **your** chats are exported, from your logged-in browser session. Site passwords and cookies are not read by the server and are not sent to the agent.
- The local key grants access only to your server on `127.0.0.1`. Do not publish it.
- Delete is **off by default** and requires explicit confirmation (`confirm: true`) plus `allowDestructive`.
- This is for exporting your own data (personal data portability). You are responsible for complying with each service’s terms of use (ToS). This is not legal advice.

Shared copy: [packages/faq.md](packages/faq.md).
