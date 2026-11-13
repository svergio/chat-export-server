import { ERROR_CODES, PLATFORMS } from '@chat-export/protocol';

export type PlatformGateState =
  | 'ok'
  | 'rate_limit'
  | 'busy'
  | 'auth_wall'
  | 'captcha'
  | 'generating'
  | 'composer_blocked'
  | 'no_tab'
  | 'offline'
  | 'error'
  | 'unknown';

export type PlatformStatusRow = {
  platform: string;
  tabOpen: boolean;
  state: PlatformGateState;
  code: string | null;
  kind: string | null;
  retryable: boolean | null;
  banner: string | null;
  generating: boolean | null;
  composerReady: boolean | null;
  checkedAt: string;
  lastAlert?: {
    code: string | null;
    message: string | null;
    ts: string | null;
  } | null;
  error?: { code: string; message: string } | null;
};

type GateCode =
  | typeof ERROR_CODES.RATE_LIMIT
  | typeof ERROR_CODES.PLATFORM_BUSY
  | typeof ERROR_CODES.UNAUTHORIZED
  | typeof ERROR_CODES.CAPTCHA;

const GATE_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.RATE_LIMIT,
  ERROR_CODES.PLATFORM_BUSY,
  ERROR_CODES.UNAUTHORIZED,
  ERROR_CODES.CAPTCHA
]);

function asGateCode(code: unknown): GateCode | null {
  if (typeof code !== 'string' || !GATE_CODES.has(code)) return null;
  return code as GateCode;
}

function mapCodeToState(code: string | null | undefined): PlatformGateState | null {
  if (code === ERROR_CODES.UNAUTHORIZED) return 'auth_wall';
  if (code === ERROR_CODES.CAPTCHA) return 'captcha';
  if (code === ERROR_CODES.RATE_LIMIT) return 'rate_limit';
  if (code === ERROR_CODES.PLATFORM_BUSY) return 'busy';
  return null;
}

export function normalizeHostGate(host: Record<string, any> | null | undefined): {
  state: PlatformGateState;
  code: string | null;
  kind: string | null;
  retryable: boolean | null;
  banner: string | null;
  generating: boolean | null;
  composerReady: boolean | null;
} {
  if (!host || typeof host !== 'object') {
    return {
      state: 'unknown',
      code: null,
      kind: null,
      retryable: null,
      banner: null,
      generating: null,
      composerReady: null
    };
  }
  const generating = typeof host.generating === 'boolean' ? host.generating : null;
  const composerReady = typeof host.composerReady === 'boolean' ? host.composerReady : null;
  const banner = host.banner == null ? null : String(host.banner);
  const code = asGateCode(host.code);
  const kind = typeof host.kind === 'string' ? host.kind : null;
  if (typeof host.state === 'string' && host.state) {
    const retryable =
      typeof host.retryable === 'boolean'
        ? host.retryable
        : code === ERROR_CODES.CAPTCHA || host.state === 'captcha'
          ? false
          : null;
    return {
      state: host.state as PlatformGateState,
      code,
      kind,
      retryable,
      banner,
      generating,
      composerReady
    };
  }
  if (host.busy) {
    const mapped = mapCodeToState(code) || 'busy';
    const retryable =
      typeof host.retryable === 'boolean'
        ? host.retryable
        : mapped === 'captcha'
          ? false
          : mapped === 'busy' || (mapped === 'rate_limit' && kind !== 'paywall');
    return { state: mapped, code: code || ERROR_CODES.PLATFORM_BUSY, kind, retryable, banner, generating, composerReady };
  }
  if (generating) {
    return { state: 'generating', code: null, kind: null, retryable: true, banner, generating, composerReady };
  }
  if (composerReady === false) {
    return {
      state: 'composer_blocked',
      code: null,
      kind: null,
      retryable: true,
      banner,
      generating,
      composerReady
    };
  }
  return { state: 'ok', code: null, kind: null, retryable: true, banner, generating, composerReady };
}

export function pickPlatformTargets(
  requested: string | undefined,
  enabled: string[] | undefined,
  allPlatforms: readonly string[] = PLATFORMS
): string[] {
  if (requested) return [requested];
  if (Array.isArray(enabled) && enabled.length) return enabled.filter((p) => allPlatforms.includes(p));
  return [...allPlatforms];
}

export function findLastPlatformAlert(
  alerts: any[] | undefined,
  platform: string
): PlatformStatusRow['lastAlert'] {
  if (!Array.isArray(alerts)) return null;
  for (const a of alerts) {
    if (!a || a.platform !== platform) continue;
    const code = asGateCode(a.code);
    if (!code) continue;
    return {
      code,
      message: a.message ? String(a.message) : null,
      ts: a.ts ? String(a.ts) : null
    };
  }
  return null;
}
