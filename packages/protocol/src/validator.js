const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  return actual === type;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error('Unsupported $ref: ' + ref);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node && node[part];
    if (node === undefined) throw new Error('Unresolved $ref: ' + ref);
  }
  return node;
}

// Subset of JSON Schema 2020-12: only the keywords used by schema.js.
export function validateSchema(root, schema, value, path = '$', errors = []) {
  const push = (message) => errors.push({ path, message });

  if (schema.$ref) return validateSchema(root, resolveRef(root, schema.$ref), value, path, errors);

  if ('const' in schema && !deepEqual(value, schema.const)) {
    push('must equal ' + JSON.stringify(schema.const));
    return errors;
  }
  if (schema.enum && !schema.enum.some((v) => deepEqual(v, value))) {
    push('must be one of ' + schema.enum.join(', '));
    return errors;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      push('must be ' + types.join(' | '));
      return errors;
    }
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s) => validateSchema(root, s, value, path, []).length === 0);
    if (passing.length !== 1) {
      push(passing.length ? 'matches more than one oneOf branch' : 'matches no oneOf branch');
      return errors;
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) push('length < ' + schema.minLength);
    if (schema.maxLength != null && value.length > schema.maxLength) push('length > ' + schema.maxLength);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) push('must match ' + schema.pattern);
    if (schema.format === 'date-time' && !ISO_DATE_TIME.test(value)) push('must be ISO 8601 date-time');
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) push('must be >= ' + schema.minimum);
    if (schema.maximum != null && value > schema.maximum) push('must be <= ' + schema.maximum);
  }

  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) push('must have >= ' + schema.minItems + ' items');
    if (schema.maxItems != null && value.length > schema.maxItems) push('must have <= ' + schema.maxItems + ' items');
    if (schema.uniqueItems) {
      for (let i = 0; i < value.length; i++) {
        if (value.slice(0, i).some((v) => deepEqual(v, value[i]))) {
          push('items must be unique');
          break;
        }
      }
    }
    if (schema.items) value.forEach((item, i) => validateSchema(root, schema.items, item, path + '[' + i + ']', errors));
  }

  if (typeOf(value) === 'object') {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push({ path: path + '.' + key, message: 'is required' });
    }
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) validateSchema(root, props[key], v, path + '.' + key, errors);
      else if (schema.additionalProperties === false) errors.push({ path: path + '.' + key, message: 'is not allowed' });
      else if (typeof schema.additionalProperties === 'object') {
        validateSchema(root, schema.additionalProperties, v, path + '.' + key, errors);
      }
    }
  }

  return errors;
}
