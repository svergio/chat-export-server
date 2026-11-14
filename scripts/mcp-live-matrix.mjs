#!/usr/bin/env node
/**
 * DEPRECATED — use the flat run-list orchestrator instead:
 *
 *   node scripts/gen-mcp-run-list.mjs
 *   node scripts/mcp-run-list.mjs --dry-run
 *   node scripts/mcp-run-list.mjs
 *   node scripts/mcp-run-list.mjs --from=042
 *   node scripts/mcp-run-list.mjs --from-state
 *
 * See docs/qa/mcp-live-matrix.md
 */
console.error('DEPRECATED: use node scripts/mcp-run-list.mjs (see docs/qa/mcp-live-matrix.md)');
process.exit(2);
