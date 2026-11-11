import type { RegisteredBrowser } from '../types.js';
import { ERROR_CODES, PLATFORMS, ProtocolError, DESTRUCTIVE_OPS } from '@chat-export/protocol';

const CREATE_OPS = new Set(['chats.create', 'chats.send', 'chats.ask_selection', 'chats.side_ask']);
const PROJECT_OPS = new Set(['containers.create', 'containers.delete', 'containers.move_chat']);

interface PlatformGate {
  platformsEnabled?: string[];
}

interface DestructiveGate {
  allowDestructive?: boolean;
}

// Server-level + browser-level gate for platform enablement.
export function assertPlatformEnabled(
  platform: string,
  serverSettings: PlatformGate | null | undefined,
  browser?: PlatformGate | null
): void {
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    throw new ProtocolError(ERROR_CODES.BAD_REQUEST, 'unknown platform: ' + platform);
  }
  const serverOk = (serverSettings?.platformsEnabled || []).includes(platform);
  if (!serverOk) {
    throw new ProtocolError(ERROR_CODES.PLATFORM_DISABLED, 'platform disabled on server: ' + platform);
  }
  if (browser) {
    const browserOk = (browser.platformsEnabled || []).includes(platform);
    if (!browserOk) {
      throw new ProtocolError(ERROR_CODES.PLATFORM_DISABLED, 'platform disabled on browser: ' + platform);
    }
  }
}

export function assertDestructiveAllowed(
  op: string,
  serverSettings: DestructiveGate | null | undefined,
  browser?: DestructiveGate | null,
  opts: { confirm?: boolean } = {}
): void {
  if (!(DESTRUCTIVE_OPS as readonly string[]).includes(op)) return;
  if (!opts.confirm) {
    throw new ProtocolError(ERROR_CODES.CONFIRM_REQUIRED, 'destructive op requires confirm:true');
  }
  if (!serverSettings?.allowDestructive) {
    throw new ProtocolError(ERROR_CODES.DESTRUCTIVE_DISABLED, 'allowDestructive is off on server');
  }
  if (browser && !browser.allowDestructive) {
    throw new ProtocolError(ERROR_CODES.DESTRUCTIVE_DISABLED, 'allowDestructive is off on browser');
  }
}

export function assertCreateAllowed(op: string, browser?: Pick<RegisteredBrowser, 'allowCreate'> | null): void {
  if (!CREATE_OPS.has(op)) return;
  if (browser && browser.allowCreate === false) {
    throw new ProtocolError(ERROR_CODES.CREATE_DISABLED, 'allowCreate is off on browser');
  }
}

export function assertProjectsAllowed(
  op: string,
  browser?: (Pick<RegisteredBrowser, 'allowProjects'> & DestructiveGate) | null,
  opts: { confirm?: boolean } = {}
): void {
  if (PROJECT_OPS.has(op)) {
    if (browser && browser.allowProjects === false) {
      throw new ProtocolError(ERROR_CODES.PROJECTS_DISABLED, 'allowProjects is off on browser');
    }
    if (op === 'containers.delete') {
      if (!opts.confirm) {
        throw new ProtocolError(ERROR_CODES.CONFIRM_REQUIRED, 'destructive op requires confirm:true');
      }
      if (browser && !browser.allowDestructive) {
        throw new ProtocolError(ERROR_CODES.DESTRUCTIVE_DISABLED, 'allowDestructive is off on browser');
      }
    }
  }
}

export function mergePlatformsList(
  serverSettings: PlatformGate | null | undefined,
  browser?: PlatformGate | null
) {
  const server = new Set(serverSettings?.platformsEnabled || []);
  const browserSet = browser ? new Set(browser.platformsEnabled || []) : null;
  return PLATFORMS.map((id) => ({
    id,
    serverEnabled: server.has(id),
    browserEnabled: browserSet ? browserSet.has(id) : null,
    enabled: server.has(id) && (browserSet ? browserSet.has(id) : true)
  }));
}
