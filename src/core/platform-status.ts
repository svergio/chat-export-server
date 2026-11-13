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
  | 'disabled'
  | 'error'
  | 'unknown';

export type UsageInfo = {
  remaining: number | null;
  limit: number | null;
  unit: string | null;
  plan: string | null;
  resetAt: string | null;
  window: string | null;
  source: string | null;
  raw: string | null;
  confidence: string | null;
} | null;

export type CaptchaWidgetInfo = {
  tag?: string | null;
  src?: string | null;
  sitekey?: string | null;
  vendor?: string | null;
  title?: string | null;
} | null;

export type PlatformStatusRow = {
  platform: string;
  tabOpen: boolean;
  state: PlatformGateState;
  code: string | null;
  kind: string | null;
  retryable: boolean | null;
  banner: string | null;
  bannerSource?: string | null;
  generating: boolean | null;
  composerReady: boolean | null;
  usage?: UsageInfo;
  captchaWidget?: CaptchaWidgetInfo;
  httpEvidence?: { status: number; url: string; retryAfter?: number } | null;
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

export function normalizeUsage(raw: unknown): UsageInfo {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const remaining = typeof u.remaining === 'number' && Number.isFinite(u.remaining) ? u.remaining : null;
  const limit = typeof u.limit === 'number' && Number.isFinite(u.limit) ? u.limit : null;
  if (remaining == null && limit == null && u.raw == null && u.plan == null) return null;
  return {
    remaining,
    limit,
    unit: typeof u.unit === 'string' ? u.unit : null,
    plan: typeof u.plan === 'string' ? u.plan : null,
    resetAt: typeof u.resetAt === 'string' ? u.resetAt : null,
    window: typeof u.window === 'string' ? u.window : null,
    source: typeof u.source === 'string' ? u.source : null,
    raw: typeof u.raw === 'string' ? u.raw.slice(0, 200) : null,
    confidence: typeof u.confidence === 'string' ? u.confidence : null
  };
}

export function hasCaptchaEvidence(host: Record<string, any> | null | undefined): boolean {
  if (!host || typeof host !== 'object') return false;
  const widget = host.captchaWidget || host.challenge;
  if (widget && typeof widget === 'object') {
    const src = typeof widget.src === 'string' ? widget.src : '';
    const vendor = typeof widget.vendor === 'string' ? widget.vendor : '';
    const tag = typeof widget.tag === 'string' ? widget.tag : '';
    if (src || vendor || tag || widget.sitekey) return true;
  }
  return host.bannerSource === 'challenge_overlay';
}

export function normalizeHostGate(host: Record<string, any> | null | undefined): {
  state: PlatformGateState;
  code: string | null;
  kind: string | null;
  retryable: boolean | null;
  banner: string | null;
  bannerSource: string | null;
  generating: boolean | null;
  composerReady: boolean | null;
  usage: UsageInfo;
  captchaWidget: CaptchaWidgetInfo;
  httpEvidence: { status: number; url: string; retryAfter?: number } | null;
} {
  const empty = {
    state: 'unknown' as PlatformGateState,
    code: null,
    kind: null,
    retryable: null,
    banner: null,
    bannerSource: null,
    generating: null,
    composerReady: null,
    usage: null as UsageInfo,
    captchaWidget: null as CaptchaWidgetInfo,
    httpEvidence: null as { status: number; url: string; retryAfter?: number } | null
  };
  if (!host || typeof host !== 'object') return empty;

  const generating = typeof host.generating === 'boolean' ? host.generating : null;
  const composerReady = typeof host.composerReady === 'boolean' ? host.composerReady : null;
  const banner = host.banner == null ? null : String(host.banner);
  const bannerSource = typeof host.bannerSource === 'string' ? host.bannerSource : null;
  const usage = normalizeUsage(host.usage);
  const captchaWidget =
    host.captchaWidget && typeof host.captchaWidget === 'object'
      ? (host.captchaWidget as CaptchaWidgetInfo)
      : host.challenge && typeof host.challenge === 'object'
        ? (host.challenge as CaptchaWidgetInfo)
        : null;
  const httpEvidence =
    host.httpEvidence && typeof host.httpEvidence === 'object'
      ? (host.httpEvidence as { status: number; url: string; retryAfter?: number })
      : null;
  const evidence = hasCaptchaEvidence(host);
  let code = asGateCode(host.code);
  let kind = typeof host.kind === 'string' ? host.kind : null;

  // Priority: generating > usage.remaining===0 > captcha(widget) > rate_limit > auth > busy > composer_blocked > ok
  if (generating === true) {
    return {
      state: 'generating',
      code: null,
      kind: null,
      retryable: true,
      banner: null,
      bannerSource: null,
      generating,
      composerReady,
      usage,
      captchaWidget: null,
      httpEvidence
    };
  }
  if (usage && usage.remaining === 0 && !evidence) {
    return {
      state: 'rate_limit',
      code: ERROR_CODES.RATE_LIMIT,
      kind: 'quota',
      retryable: true,
      banner: usage.raw || banner,
      bannerSource: bannerSource || usage.source,
      generating,
      composerReady,
      usage,
      captchaWidget: null,
      httpEvidence
    };
  }
  if (evidence && (code === ERROR_CODES.CAPTCHA || host.state === 'captcha' || kind === 'captcha' || evidence)) {
    return {
      state: 'captcha',
      code: ERROR_CODES.CAPTCHA,
      kind: kind || 'captcha',
      retryable: false,
      banner,
      bannerSource: bannerSource || 'challenge_overlay',
      generating,
      composerReady,
      usage,
      captchaWidget,
      httpEvidence
    };
  }
  // Labeled captcha without evidence while idle → do not trust (false positive).
  let busy = !!host.busy;
  if (
    (code === ERROR_CODES.CAPTCHA || host.state === 'captcha' || kind === 'captcha') &&
    !evidence
  ) {
    code = null;
    kind = null;
    busy = false;
    if (generating) {
      return {
        state: 'generating',
        code: null,
        kind: null,
        retryable: true,
        banner: null,
        bannerSource: null,
        generating,
        composerReady,
        usage,
        captchaWidget: null,
        httpEvidence
      };
    }
  }

  if (typeof host.state === 'string' && host.state && host.state !== 'captcha') {
    const retryable =
      typeof host.retryable === 'boolean'
        ? host.retryable
        : host.state === 'captcha'
          ? false
          : null;
    return {
      state: host.state as PlatformGateState,
      code,
      kind,
      retryable,
      banner,
      bannerSource,
      generating,
      composerReady,
      usage,
      captchaWidget,
      httpEvidence
    };
  }
  if (busy) {
    const mapped = mapCodeToState(code) || 'busy';
    const retryable =
      typeof host.retryable === 'boolean'
        ? host.retryable
        : mapped === 'captcha'
          ? false
          : mapped === 'busy' || (mapped === 'rate_limit' && kind !== 'paywall');
    return {
      state: mapped,
      code: code || ERROR_CODES.PLATFORM_BUSY,
      kind,
      retryable,
      banner,
      bannerSource,
      generating,
      composerReady,
      usage,
      captchaWidget,
      httpEvidence
    };
  }
  if (generating) {
    return {
      state: 'generating',
      code: null,
      kind: null,
      retryable: true,
      banner,
      bannerSource,
      generating,
      composerReady,
      usage,
      captchaWidget,
      httpEvidence
    };
  }
  if (composerReady === false) {
    return {
      state: 'composer_blocked',
      code: null,
      kind: null,
      retryable: true,
      banner,
      bannerSource,
      generating,
      composerReady,
      usage,
      captchaWidget,
      httpEvidence
    };
  }
  return {
    state: 'ok',
    code: null,
    kind: null,
    retryable: true,
    banner,
    bannerSource,
    generating,
    composerReady,
    usage,
    captchaWidget,
    httpEvidence
  };
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
