#!/usr/bin/env node
/**
 * Write raw JSON (Feishu merged client_vars dump) to .playwright-mcp/feishu-api--{token}.json
 *
 * Usage (from repo root):
 *   node scripts/write-feishu-api-dump-from-stdin.mjs I8wnwDW9riOkKJk2sLAcsN8Onff < payload.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/write-feishu-api-dump-from-stdin.mjs <wiki_token> < payload.json');
  process.exit(1);
}
const raw = fs.readFileSync(0, 'utf8').trim();
if (!raw) {
  console.error('stdin empty');
  process.exit(1);
}
const out = path.join(root, '.playwright-mcp', `feishu-api--${token}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, raw, 'utf8');
console.error('wrote', out, 'bytes', raw.length);
