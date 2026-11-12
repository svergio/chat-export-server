import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const productLicense = pkg.license || 'MIT';

const lc = spawnSync('npx', ['--yes', 'license-checker', '--production', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
});

if (lc.status !== 0) {
  console.error(lc.stderr?.trim() || 'license-checker failed');
  process.exit(lc.status || 1);
}

const treeParsed = JSON.parse(lc.stdout);
const direct = Object.keys(pkg.dependencies || {}).sort();

function licenseFor(dep) {
  const key = Object.keys(treeParsed).find((k) => {
    const at = k.lastIndexOf('@');
    return at > 0 && k.slice(0, at) === dep;
  });
  return key ? String(treeParsed[key].licenses || 'UNKNOWN') : 'UNKNOWN';
}

const notableTransitives = [
  '@hono/node-server',
  'express',
  'hono',
  'ws'
].map((name) => {
  const key = Object.keys(treeParsed).find((k) => {
    const at = k.lastIndexOf('@');
    return at > 0 && k.slice(0, at) === name;
  });
  if (!key) return null;
  return `| \`${name}\` | ${treeParsed[key].licenses || 'UNKNOWN'} | Transitive (via @modelcontextprotocol/sdk) |`;
}).filter(Boolean);

const npmRows = direct.map((d) => {
  const note = d === '@chat-export/protocol' ? 'Workspace package in `packages/protocol/` (ISC)' : 'npm runtime';
  return `| \`${d}\` | ${licenseFor(d)} | ${note} |`;
});

const prodCount = Object.keys(treeParsed).length;

const body = `# Third-party notices

chat-export-server is licensed under the [MIT License](./LICENSE).

Direct **runtime** npm dependencies are listed below. After \`npm ci --omit=dev\`, this tree currently resolves to about **${prodCount}** production packages (mostly MIT/ISC from the MCP SDK HTTP stack). There is **no** Playwright, Puppeteer, Electron, or cloud vendor SDK in the runtime graph.

Regenerate: \`npm run licenses\` (\`npx license-checker\`; not a committed dependency).

## Direct runtime dependencies

| Package | License | Notes |
| --- | --- | --- |
${npmRows.join('\n')}

## Notable transitive packages (license review)

| Package | License | Notes |
| --- | --- | --- |
${notableTransitives.join('\n')}

## First-party workspace

| Package | License | Notes |
| --- | --- | --- |
| \`@chat-export/protocol\` | ISC | Wire contract (WebSocket/MCP payloads); source in \`packages/protocol/\` |

## Product family (separate GitHub repos)

| Repo | Coupling |
| --- | --- |
| [chat-export-extension](https://github.com/svergio/chat-export-extension) | Browser WebSocket client (\`ceb_\`); not an npm dependency |
| [chat-export-dashboard](https://github.com/svergio/chat-export-dashboard) | Static UI embedded under \`dashboard/\` submodule; optional split Docker/nginx front |

## Optional integrations (not dependencies)

Cursor MCP config helpers, Open WebUI, BibLLMsteak, Bonsai-27B, and NodeRed maintainer paths are **not** required at runtime. They are examples of MCP clients or internal docs only.

### SBOM (optional)

\`npm sbom --omit dev\` (npm 11+) can emit SPDX JSON for supply-chain tooling; no extra CycloneDX packages are required in this repo.

---

_Generated for ${pkg.name}@${pkg.version}. Product license: ${productLicense}._
`;

const out = join(root, 'THIRD_PARTY_NOTICES.md');
writeFileSync(out, body);
console.log(`wrote ${out}`);
