import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';
import { hasCaptchaEvidence, normalizeHostGate } from './platform-status.js';

export type OnCaptcha = 'stop' | 'wait_human' | 'allow_agent';

export type HostEnvelope = {
  state: string;
  code: string | null;
  kind: string | null;
  retryable: boolean | null;
  banner: string | null;
  bannerSource?: string | null;
  generating: boolean | null;
  composerReady: boolean | null;
  challenge?: Record<string, unknown> | null;
  captchaWidget?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  httpEvidence?: Record<string, unknown> | null;
};

const ON_CAPTCHA_VALUES = new Set<OnCaptcha>(['stop', 'wait_human', 'allow_agent']);

export function parseOnCaptcha(value: unknown): OnCaptcha {
  if (value == null || value === '') return 'stop';
  const v = String(value);
  if (!ON_CAPTCHA_VALUES.has(v as OnCaptcha)) {
    throw new ProtocolError(ERROR_CODES.INVALID_ARGS, 'onCaptcha must be stop|wait_human|allow_agent', {
      onCaptcha: value
    });
  }
  return v as OnCaptcha;
}

export function isCaptchaGate(host: Record<string, any> | null | undefined): boolean {
  if (!host || typeof host !== 'object') return false;
  if (host.generating === true) return false;
  if (!hasCaptchaEvidence(host)) return false;
  if (host.code === ERROR_CODES.CAPTCHA) return true;
  if (host.state === 'captcha') return true;
  if (host.kind === 'captcha') return true;
  // Widget alone is enough evidence when idle.
  return true;
}

export function hostEnvelope(host: Record<string, any> | null | undefined): HostEnvelope {
  const gate = normalizeHostGate(host);
  const out: HostEnvelope = {
    state: gate.state,
    code: gate.code,
    kind: gate.kind,
    retryable: gate.retryable,
    banner: gate.banner,
    bannerSource: gate.bannerSource,
    generating: gate.generating,
    composerReady: gate.composerReady,
    usage: gate.usage as Record<string, unknown> | null,
    captchaWidget: gate.captchaWidget as Record<string, unknown> | null,
    httpEvidence: gate.httpEvidence as Record<string, unknown> | null
  };
  if (host && typeof host === 'object' && host.challenge && typeof host.challenge === 'object') {
    out.challenge = host.challenge as Record<string, unknown>;
  } else if (gate.captchaWidget) {
    out.challenge = gate.captchaWidget as Record<string, unknown>;
  }
  return out;
}

function captchaError(
  platform: string,
  host: Record<string, any> | null | undefined,
  onCaptcha: OnCaptcha
): ProtocolError {
  const env = hostEnvelope(host);
  const allowAgent = onCaptcha === 'allow_agent';
  const hint = allowAgent
    ? 'Captcha is never auto-solved. allow_agent only permits UI action when the operator opted in via the client prompt; otherwise hand off to a human.'
    : 'Solve the captcha in the browser tab or hand off to a human. Captcha is never auto-solved.';
  return new ProtocolError(
    ERROR_CODES.CAPTCHA,
    env.banner || platform + ' captcha challenge',
    {
      retryable: false,
      kind: 'captcha',
      banner: env.banner,
      host: env,
      allowAgentCaptcha: allowAgent,
      onCaptcha,
      hint,
      ...(env.challenge ? { challenge: env.challenge } : {}),
      ...(env.captchaWidget ? { captchaWidget: env.captchaWidget } : {})
    }
  );
}

export async function enforceCaptchaPolicy(opts: {
  platform: string;
  onCaptcha?: OnCaptcha;
  fetchHost: () => Promise<Record<string, any> | null>;
  timeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<HostEnvelope> {
  const onCaptcha = opts.onCaptcha || 'stop';
  const sleep = opts.sleep || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now || Date.now;
  const pollMs = Math.max(50, opts.pollMs ?? 500);
  const timeoutMs = Math.max(pollMs, opts.timeoutMs ?? 120_000);

  let host = await opts.fetchHost();
  if (!isCaptchaGate(host)) return hostEnvelope(host);

  if (onCaptcha === 'stop' || onCaptcha === 'allow_agent') {
    throw captchaError(opts.platform, host, onCaptcha);
  }

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(pollMs);
    host = await opts.fetchHost();
    if (!isCaptchaGate(host)) return hostEnvelope(host);
  }
  throw captchaError(opts.platform, host, 'wait_human');
}

export function stripCaptchaArgs<T extends Record<string, any>>(args: T): {
  wire: Omit<T, 'onCaptcha' | 'ensureTab'>;
  onCaptcha: OnCaptcha;
  ensureTab: boolean;
} {
  const onCaptcha = parseOnCaptcha(args?.onCaptcha);
  const ensureTab = args?.ensureTab === true;
  const wire = { ...args };
  delete (wire as any).onCaptcha;
  delete (wire as any).ensureTab;
  return { wire, onCaptcha, ensureTab };
}

export function withHost<T>(data: T, host: HostEnvelope | null | undefined): T | (T & { host: HostEnvelope }) {
  if (!host) return data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { ...(data as object), host } as T & { host: HostEnvelope };
  }
  return { value: data, host } as unknown as T & { host: HostEnvelope };
}
