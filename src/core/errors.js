import { ERROR_CODES, ProtocolError } from '@chat-export/protocol';

export function toProtocolError(err) {
  if (err instanceof ProtocolError) return err;
  if (err && ERROR_CODES[err.code]) {
    return new ProtocolError(err.code, err.message || err.code, err.details);
  }
  return new ProtocolError(ERROR_CODES.HOST_ERROR, err?.message || String(err));
}

export function errorToJson(err) {
  const pe = toProtocolError(err);
  return pe.toJSON();
}

export function isProtocolError(err) {
  return err instanceof ProtocolError || (err && ERROR_CODES[err.code]);
}
