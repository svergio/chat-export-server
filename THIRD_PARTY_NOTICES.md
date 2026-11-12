# Third-party notices

chat-export-server is licensed under the [MIT License](./LICENSE).

Direct **runtime** npm dependencies are listed below. After `npm ci --omit=dev`, this tree currently resolves to about **95** production packages (mostly MIT/ISC from the MCP SDK HTTP stack). There is **no** Playwright, Puppeteer, Electron, or cloud vendor SDK in the runtime graph.

Regenerate: `npm run licenses` (`npx license-checker`; not a committed dependency).

## Direct runtime dependencies

| Package | License | Notes |
| --- | --- | --- |
| `@chat-export/protocol` | ISC | Workspace package in `packages/protocol/` (ISC) |
| `@modelcontextprotocol/sdk` | MIT | npm runtime |
| `ws` | MIT | npm runtime |
| `zod` | MIT | npm runtime |

## Notable transitive packages (license review)

| Package | License | Notes |
| --- | --- | --- |
| `@hono/node-server` | MIT | Transitive (via @modelcontextprotocol/sdk) |
| `express` | MIT | Transitive (via @modelcontextprotocol/sdk) |
| `hono` | MIT | Transitive (via @modelcontextprotocol/sdk) |
| `ws` | MIT | Transitive (via @modelcontextprotocol/sdk) |

## First-party workspace

| Package | License | Notes |
| --- | --- | --- |
| `@chat-export/protocol` | ISC | Wire contract (WebSocket/MCP payloads); source in `packages/protocol/` |

## Product family (separate GitHub repos)

| Repo | Coupling |
| --- | --- |
| [chat-export-extension](https://github.com/svergio/chat-export-extension) | Browser WebSocket client (`ceb_`); not an npm dependency |
| [chat-export-dashboard](https://github.com/svergio/chat-export-dashboard) | Static UI embedded under `dashboard/` submodule; optional split Docker/nginx front |

## Optional integrations (not dependencies)

Cursor MCP config helpers, Open WebUI, BibLLMsteak, Bonsai-27B, and NodeRed maintainer paths are **not** required at runtime. They are examples of MCP clients or internal docs only.

### SBOM (optional)

`npm sbom --omit dev` (npm 11+) can emit SPDX JSON for supply-chain tooling; no extra CycloneDX packages are required in this repo.

---

_Generated for chat-export-server@1.0.4. Product license: MIT._
