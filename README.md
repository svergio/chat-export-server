# chat-export-server

Local MCP server for the Chat Export browser extension. Lists, exports, creates, and deletes your own chats on ChatGPT, Grok, X Grok, and GitHub Copilot through the extension running in your browser. Everything stays on `127.0.0.1`.

Status: work in progress. Only the wire contract (`packages/protocol`) exists so far.

## Layout

```text
packages/protocol/   JSON Schemas, constants, validate() for the extension <-> server contract (v1)
src/core/            config, keys, settings, audit (planned)
src/hub/             WS browser registry, bind, RPC (planned)
src/mcp/             MCP tools (planned)
src/cli/             CLI (planned)
test/                unit + contract tests
```

## Development

```sh
npm install
npm test
```

Requires Node 20+.
