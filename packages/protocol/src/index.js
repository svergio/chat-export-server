import { schema, OP_SCHEMAS } from './schema.js';
import { validateSchema } from './validator.js';
import { ERROR_CODES } from './constants.js';

export * from './constants.js';
export { schema, OP_SCHEMAS };

/** @typedef {{ valid: boolean, errors: { path: string, message: string }[] }} ValidationResult */

export class ProtocolError extends Error {
  /**
   * @param {import('./constants.js').ErrorCode} code
   * @param {string} message
   * @param {object} [details]
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
    if (details) this.details = details;
  }

  toJSON() {
    return this.details
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

function result(errors) {
  return { valid: errors.length === 0, errors };
}

function formatErrors(errors) {
  return errors.map((e) => e.path + ' ' + e.message).join('; ');
}

/**
 * @param {string} defName key of schema.$defs, e.g. 'Chat', 'RpcRequest', 'ChatsListArgs'
 * @param {unknown} value
 * @returns {ValidationResult}
 */
export function validate(defName, value) {
  const def = schema.$defs[defName];
  if (!def) throw new Error('Unknown schema: ' + defName);
  return result(validateSchema(schema, def, value));
}

/**
 * @param {string} defName
 * @param {unknown} value
 */
export function assertValid(defName, value) {
  const res = validate(defName, value);
  if (!res.valid) {
    throw new ProtocolError(ERROR_CODES.BAD_REQUEST, defName + ': ' + formatErrors(res.errors), { errors: res.errors });
  }
  return value;
}

/** @param {unknown} req */
export function validateRpcRequest(req) {
  const env = validate('RpcRequest', req);
  if (!env.valid) return env;
  const op = /** @type {any} */ (req).op;
  const args = validate(OP_SCHEMAS[op].args, /** @type {any} */ (req).args);
  return result(args.errors.map((e) => ({ path: e.path.replace(/^\$/, '$.args'), message: e.message })));
}

/**
 * @param {unknown} res
 * @param {import('./constants.js').Op} [op] when given, `data` of a success response is checked against the op result schema
 */
export function validateRpcResponse(res, op) {
  const env = validate('RpcResponse', res);
  if (!env.valid || !op || !(/** @type {any} */ (res).ok)) return env;
  const data = validate(OP_SCHEMAS[op].result, /** @type {any} */ (res).data);
  return result(data.errors.map((e) => ({ path: e.path.replace(/^\$/, '$.data'), message: e.message })));
}

/**
 * @param {import('./constants.js').Op} op
 * @param {unknown} data
 */
export function validateOpResult(op, data) {
  if (!OP_SCHEMAS[op]) throw new Error('Unknown op: ' + op);
  return validate(OP_SCHEMAS[op].result, data);
}

/**
 * @param {string} id
 * @param {any} data
 * @returns {import('./schema.js').RpcResponse}
 */
export function rpcOk(id, data) {
  return { id, ok: true, data };
}

/**
 * @param {string} id
 * @param {import('./constants.js').ErrorCode} code
 * @param {string} message
 * @param {object} [details]
 * @returns {import('./schema.js').RpcResponse}
 */
export function rpcError(id, code, message, details) {
  const error = details ? { code, message, details } : { code, message };
  return { id, ok: false, error };
}
