import { writeFileSync, mkdirSync } from 'node:fs';
import { schema } from '../src/schema.js';

const out = new URL('../schemas/protocol.schema.json', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, JSON.stringify(schema, null, 2) + '\n');
console.log('wrote schemas/protocol.schema.json');
