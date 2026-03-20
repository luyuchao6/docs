#!/usr/bin/env node
/**
 * Run feishu-client-vars-to-markdown.mjs for one wiki token only (reads output path
 * from feishu-wiki-cn-manifest.json). Does not run apply-feishu-api-dumps (no bulk overwrite).
 *
 * Usage:
 *   node scripts/feishu-convert-one-dump-to-cn.mjs <wiki_token>
 *
 * Requires: .playwright-mcp/feishu-api--{wikiToken}.json (non-stub) from feishu-pull-one-wiki-page.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/feishu-convert-one-dump-to-cn.mjs <wiki_token>');
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'feishu-wiki-cn-manifest.json'), 'utf8')
);
const row = manifest.find(([t]) => t === token);
if (!row) {
  console.error('Token not in feishu-wiki-cn-manifest.json:', token);
  process.exit(1);
}

const dumpPath = path.join(root, '.playwright-mcp', `feishu-api--${token}.json`);
if (!fs.existsSync(dumpPath)) {
  console.error('Missing dump:', dumpPath);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
if (raw.stub || !raw.blockMap) {
  console.error('Dump is stub or missing blockMap; re-fetch with feishu-pull-one-wiki-page.mjs');
  process.exit(1);
}

const cnRel = row[1];
const outMd = path.join(root, 'docs', 'cn', cnRel);
const converter = path.join(__dirname, 'feishu-client-vars-to-markdown.mjs');

const r = spawnSync(process.execPath, [converter, dumpPath, outMd], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
