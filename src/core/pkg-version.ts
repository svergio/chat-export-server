import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function readPackageVersion(fallback = '0.0.0'): string {
  try {
    const pkg = require('../../package.json') as { version?: string };
    const v = typeof pkg?.version === 'string' ? pkg.version.trim() : '';
    return v || fallback;
  } catch {
    return fallback;
  }
}

export const PACKAGE_VERSION = readPackageVersion();
