import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';

export function toProtocolError(err: any): ProtocolError {
  if (err instanceof ProtocolError) return err;
  if (err && (ERROR_CODES as Record<string, string>)[err.code]) {
    return new ProtocolError(err.code, err.message || err.code, err.details);
  }
  return new ProtocolError(ERROR_CODES.HOST_ERROR, err?.message || String(err));
}

export function errorToJson(err: unknown) {
  const pe = toProtocolError(err);
  return pe.toJSON();
}

export function isProtocolError(err: any): boolean {
  return err instanceof ProtocolError || Boolean(err && (ERROR_CODES as Record<string, string>)[err.code]);
}
