# Security Policy

Local MCP server (loopback HTTP/WebSocket, token auth, optional dashboard on `/dashboard`).

## Supported versions

Only the latest release on the `main` branch receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems.

Use GitHub private vulnerability reporting:
https://github.com/svergio/chat-export-server/security/advisories/new

Include affected version or commit, reproduction steps, and impact. You can expect an acknowledgement within 7 days and a fix or mitigation plan within 30 days for confirmed issues.

## Scope and hardening notes

- Never bind the server to a non-loopback address without a firewall, TLS termination, and token rotation.
- Change `dashboard.password` in `~/.chat-export/config.json` (the default is `changeme`).
- Treat `~/.chat-export/` (SQLite database with hashed MCP/browser tokens, logs, optional `mcp-token.txt` plaintext artifact) and `.cursor/mcp.json` as secrets: they hold chat content and bearer tokens. Tokens are not stored in `keys.json`.
- Rotate the MCP token (`chat-export-server key` or the dashboard) if it was ever pasted into an issue, log, or shared config.

## Secrets

Never commit bearer tokens (`cem_...`, `ceb_...`, legacy `cek_...`), `mcp.json` files that contain them, `CHAT_EXPORT_ADMIN_PASS` / dashboard passwords, or `~/.chat-export` contents. Keep local `.env` out of git (see `.gitignore`) and restrict it to the owner (`chmod 600 .env`). `.env.example` must stay placeholder-only. If a token leaks, rotate it immediately and report the exposure through the channel above.

Destructive dashboard actions (`POST /dashboard/api/jobs/cancel`, `POST /dashboard/api/mcp-token/rotate`) require an authenticated session **and** JSON body `{ "confirm": true }`.
