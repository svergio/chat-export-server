import { ERROR_CODES, PLATFORMS, ProtocolError, DESTRUCTIVE_OPS } from '@chat-export/protocol';

const CREATE_OPS = new Set(['chats.create', 'chats.send', 'chats.ask_selection', 'chats.side_ask']);
const PROJECT_OPS = new Set(['containers.create', 'containers.delete', 'containers.move_chat']);

/**
 * Server-level + browser-level gate for platform enablement.
 * @param {string} platform
 * @param {{ platformsEnabled?: string[] }} serverSettings
 * @param {{ platformsEnabled?: string[] } | null} browser
 */
export function assertPlatformEnabled(platform, serverSettings, browser) {
  if (!PLATFORMS.includes(platform)) {
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

/**
 * @param {string} op
 * @param {{ allowDestructive?: boolean }} serverSettings
 * @param {{ allowDestructive?: boolean } | null} browser
 * @param {{ confirm?: boolean }} [opts]
 */
export function assertDestructiveAllowed(op, serverSettings, browser, opts = {}) {
  if (!DESTRUCTIVE_OPS.includes(op)) return;
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

export function assertCreateAllowed(op, browser) {
  if (!CREATE_OPS.has(op)) return;
  if (browser && browser.allowCreate === false) {
    throw new ProtocolError(ERROR_CODES.CREATE_DISABLED, 'allowCreate is off on browser');
  }
}

export function assertProjectsAllowed(op, browser, opts = {}) {
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

export function mergePlatformsList(serverSettings, browser) {
  const server = new Set(serverSettings?.platformsEnabled || []);
  const browserSet = browser ? new Set(browser.platformsEnabled || []) : null;
  return PLATFORMS.map((id) => ({
    id,
    serverEnabled: server.has(id),
    browserEnabled: browserSet ? browserSet.has(id) : null,
    enabled: server.has(id) && (browserSet ? browserSet.has(id) : true)
  }));
}
