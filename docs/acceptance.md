# W6 acceptance — chat-export-server

Date: 2026-11-09  
Server commit under test: `bfa59fd`  
Companion extension: workspace `projects/chat-export-extension` v1.7.0 (uncommitted tree; reloaded in Chrome for live e2e)

## Test counts

| Suite | Command | Result |
|-------|---------|--------|
| Server unit + contract + protocol | `npm test` | **30 pass / 0 fail** |
| Server unit only | `npm run test:unit` | covered in above |
| Server contract | `npm run test:contract` | covered in above (PLATFORM_DISABLED, CONFIRM_REQUIRED, DESTRUCTIVE_DISABLED, bad Bearer → 401, key not echoed) |
| Extension unit | `npm run test:unit` (extension repo) | **pass** (`test-settings: ok`) |
| Extension build | `npm run build` | **pass** |

No additional contract cases were required: gates and Bearer 401 already covered in `test/contract/mcp.test.js`.

## Definition of Done checklist

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | `chat-export-server start` + `key new`; listen only `127.0.0.1` | **PASS** | Test home `/tmp/ce-w6-*`; listen `:8765`; `/health` ok; WS `/ws` and `/ext` |
| 2 | Popup On/Off, connected status, platform toggles | **PARTIAL** | FAQ screen and bridge `offline` / `faq consent required` observed live. Full post-consent On/Off + platform toggle UI not exercised (unit covers settings gates) |
| 3 | FAQ before connect; no consent → bridge off | **PASS** | Popup shows FAQ + «Понимаю и согласен»; storage has no FAQ consent; `ce.bridgeStatus.state=offline` |
| 4 | MCP `browsers_list` sees 2 browsers; `browsers_bind` switches | **SKIP** | Only Chrome `Default` has Chat Export installed (`Profile 2` exists without extension). Single-profile only |
| 5 | Live create → list → export(md+json) → delete on 4 platforms | see platform table | Destructive ops only on `[ce-test]` chats |
| 6 | `chats_delete` without `confirm` / `allowDestructive=false` rejected + audit | **PASS** | Contract tests |
| 7 | Bad Bearer → 401; key not logged | **PASS** | Contract HTTP `/mcp` test |
| 8 | Contract/unit green; e2e signed here | **PASS** | This file |
| 9 | Server README (install, key, Cursor MCP, FAQ) | **PASS** | Existing `README.md` + `packages/faq.md` |

## Live e2e (content-script RPC via `chrome.tabs.sendMessage`)

Method: extension service worker → `chat-export-rpc` → `CE.dispatchRpc` (server bridge not connected because FAQ gate). Pre-flight: Copilot API origins added to extension `host_permissions`; extension reloaded to 1.7.0.

| Platform | Session | Create | List finds | Export md+json | Delete | List gone | Verdict |
|----------|---------|--------|------------|----------------|--------|-----------|---------|
| chatgpt | yes | ops **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| grok | yes | ops **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** |
| grok-x | yes | ops **FAIL** (`X Grok chatId timeout`); UI Enter **PASS** | query miss / title lag; export by id **PASS** | **PASS** | **PASS** | **PASS** | **PASS_HYBRID** (ops create blocker) |
| copilot | yes | ops **FAIL** (timeout / bfcache); UI Send **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS_HYBRID** (ops create blocker) |

### Blockers / follow-ups

- **grok-x / copilot `ops.create`**: fill+send does not reliably produce `chatId` in URL within 45s. Manual/DevTools Enter or «Send now» works. Track as extension ops create reliability issue (not a server defect).
- **Multi-browser bind**: SKIP until a second profile loads the extension and connects with FAQ consent + key.
- **Server↔extension MCP path**: not live-wired in this run (FAQ consent required). Contract path with mock extension **PASS**.

## Regression (composer bar)

| Host | Bar `[data-ce-host]` | Format menu (MD/YAML/JSON/HTML/PDF) |
|------|----------------------|--------------------------------------|
| chatgpt | **PASS** | **PASS** |
| grok | **PASS** | **PASS** |
| grok-x | **PASS** | **PASS** |
| copilot | **PASS** | **PASS** |

## Pre-flight fix (extension)

Added to `manifest.json` `host_permissions`:

- `https://api.individual.githubcopilot.com/*`
- `https://api.business.githubcopilot.com/*`
- `https://api.enterprise.githubcopilot.com/*`

(as documented in extension `docs/site-maps/github.com-copilot.md`). Extension rebuilt; Chrome reload confirmed manifest 1.7.0 with these hosts.
