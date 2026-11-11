#!/usr/bin/env node
import { startServer, PKG_VERSION } from '../server.js';
import { ServerCore } from '../core/server-core.js';
import { resolveHome } from '../core/paths.js';

function usage(): string {
  return `chat-export-server ${PKG_VERSION}

Usage:
  chat-export-server start [--stdio] [--port N] [--home DIR] [--headless] [--dashboard] [--admin-user USER] [--admin-pass PASS]
  chat-export-server key new
  chat-export-server key rotate
  chat-export-server key list
  chat-export-server browser add --id BROWSER_ID --token ceb_... [--label NAME]
  chat-export-server status

Env:
  CHAT_EXPORT_HOME   config directory (default: ~/.chat-export)
`;
}

interface CliFlags {
  stdio?: boolean;
  port?: number;
  home?: string;
  headless?: boolean;
  dashboard?: boolean;
  adminUser?: string;
  adminPass?: string;
  id?: string;
  token?: string;
  label?: string;
  help?: boolean;
}

interface ParsedArgs {
  cmd: string | undefined;
  sub: string | undefined;
  flags: CliFlags;
  positionals: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const out: ParsedArgs = { cmd: args[0], sub: args[1], flags: {}, positionals: [] };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--stdio') out.flags.stdio = true;
    else if (a === '--port') out.flags.port = Number(args[++i]);
    else if (a === '--home') out.flags.home = args[++i];
    else if (a === '--headless') out.flags.headless = true;
    else if (a === '--dashboard') out.flags.dashboard = true;
    else if (a === '--admin-user') out.flags.adminUser = args[++i];
    else if (a === '--admin-pass') out.flags.adminPass = args[++i];
    else if (a === '--id') out.flags.id = args[++i];
    else if (a === '--token') out.flags.token = args[++i];
    else if (a === '--label') out.flags.label = args[++i];
    else if (a === '--help' || a === '-h') out.flags.help = true;
    else if (!a.startsWith('-')) out.positionals.push(a);
  }
  return out;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  if (!parsed.cmd || parsed.flags.help) {
    process.stdout.write(usage());
    process.exit(parsed.cmd ? 0 : 1);
  }

  const home = parsed.flags.home || resolveHome();

  if (parsed.cmd === 'start') {
    const dashOpts: { enabled?: boolean; username?: string; password?: string } = {};
    if (parsed.flags.headless) dashOpts.enabled = false;
    else if (parsed.flags.dashboard) dashOpts.enabled = true;
    if (parsed.flags.adminUser) dashOpts.username = parsed.flags.adminUser;
    if (parsed.flags.adminPass !== undefined) dashOpts.password = parsed.flags.adminPass;
    const server = await startServer({
      home,
      stdio: Boolean(parsed.flags.stdio),
      port: parsed.flags.port,
      dashboard: Object.keys(dashOpts).length ? dashOpts : undefined
    });
    const log = (...xs: unknown[]) => process.stderr.write(xs.join(' ') + '\n');
    const dashNote = server.dashboardEnabled ? ', dashboard /dashboard' : ', dashboard off (headless)';
    log(
      `chat-export-server listening on http://${server.host}:${server.port} (ws /ws|/ext, mcp /mcp${dashNote})`
    );
    if (parsed.flags.stdio) log('MCP stdio transport attached');

    const shutdown = async () => {
      log('shutting down');
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  if (parsed.cmd === 'key') {
    const core = new ServerCore({ home, serverVersion: PKG_VERSION });
    const sub = parsed.sub || parsed.positionals[0];
    if (sub === 'new') {
      const r = core.keyNew();
      process.stdout.write(r.key + '\n');
      process.stderr.write(
        `stored hash only (id=${r.id} fingerprint=${r.fingerprint}). Copy the key now; it will not be shown again.\n`
      );
      return;
    }
    if (sub === 'rotate') {
      const r = core.keyRotate();
      process.stdout.write(r.key + '\n');
      process.stderr.write(
        `rotated; old key revoked (id=${r.id} fingerprint=${r.fingerprint}). Update extension and MCP clients.\n`
      );
      return;
    }
    if (sub === 'list') {
      process.stdout.write(JSON.stringify(core.keyList(), null, 2) + '\n');
      return;
    }
    process.stderr.write('unknown key subcommand\n' + usage());
    process.exit(1);
  }

  if (parsed.cmd === 'browser') {
    const core = new ServerCore({ home, serverVersion: PKG_VERSION });
    const sub = parsed.sub || parsed.positionals[0];
    if (sub === 'add') {
      const browserId = parsed.flags.id;
      const token = parsed.flags.token;
      const browserLabel = parsed.flags.label;
      if (!browserId || !token) {
        process.stderr.write('browser add requires --id and --token\n' + usage());
        process.exit(1);
      }
      const enrolled = core.browserEnroll({ browserId, key: token, browserLabel });
      process.stdout.write(JSON.stringify(enrolled, null, 2) + '\n');
      return;
    }
    process.stderr.write('unknown browser subcommand\n' + usage());
    process.exit(1);
  }

  if (parsed.cmd === 'status') {
    const core = new ServerCore({ home, serverVersion: PKG_VERSION });
    process.stdout.write(JSON.stringify(core.status(), null, 2) + '\n');
    return;
  }

  process.stderr.write('unknown command\n' + usage());
  process.exit(1);
}

main().catch((err: any) => {
  process.stderr.write((err?.stack || err?.message || String(err)) + '\n');
  process.exit(1);
});
