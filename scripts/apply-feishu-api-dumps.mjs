#!/usr/bin/env node
/**
 * Offline step: read raw Feishu API dumps from .playwright-mcp/ and write docs/cn.
 * Re-run anytime after editing feishu-client-vars-to-markdown.mjs (dumps are kept by default).
 *
 * Usage:
 *   node scripts/apply-feishu-api-dumps.mjs
 *   node scripts/apply-feishu-api-dumps.mjs --delete-dumps   # remove each JSON after success (save disk)
 *
 * Phase 1 (download dumps only): feishu-pull-wiki-playwright.mjs or npm run feishu:pull
 * Phase 2 (this script): npm run feishu:dump_to_markdown
 *
 * docs/en/ is maintained by manual translation from CN, not from Feishu.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const deleteDumps = process.argv.includes('--delete-dumps');
const mcpDir = path.join(root, '.playwright-mcp');
const manifestPath = path.join(__dirname, 'feishu-wiki-cn-manifest.json');
const converter = path.join(__dirname, 'feishu-client-vars-to-markdown.mjs');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function findDumpFile(wikiToken) {
  if (!fs.existsSync(mcpDir)) return null;
  const exact = `feishu-api--${wikiToken}.json`;
  const p = path.join(mcpDir, exact);
  if (fs.existsSync(p)) return p;
  const files = fs.readdirSync(mcpDir);
  const hit = files.find(
    (f) => f.endsWith('.json') && f.includes(wikiToken.slice(0, 12))
  );
  return hit ? path.join(mcpDir, hit) : null;
}

function formatStubFront(wikiToken, title) {
  const iso = new Date().toISOString().slice(0, 10);
  const url = `https://lingdongfangcheng.feishu.cn/wiki/${wikiToken}`;
  return `---
url: ${url}
last_updated: "${iso}"
---

# ${title || '（飞书页面）'}

> **此页为飞书表格或非 Docx 文档，无法通过 client_vars API 导出正文。请在飞书中查看或导出。**

Source: [${title || 'wiki'}](${url})
`;
}

for (const [wikiToken, cnRel] of manifest) {
  const dumpPath = findDumpFile(wikiToken);
  const outMd = path.join(root, 'docs/cn', cnRel);

  if (!dumpPath) {
    console.warn('Missing dump for', wikiToken, cnRel);
    continue;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  } catch (e) {
    console.warn('Bad JSON', dumpPath, e.message);
    continue;
  }

  if (raw.stub || !raw.blockMap) {
    const title = raw.title || cnRel.split('/').pop().replace(/\.md$/, '');
    fs.mkdirSync(path.dirname(outMd), { recursive: true });
    fs.writeFileSync(outMd, formatStubFront(wikiToken, title), 'utf8');
    console.log('stub', cnRel);
    if (deleteDumps) fs.unlinkSync(dumpPath);
    continue;
  }

  const r = spawnSync(process.execPath, [converter, dumpPath, outMd], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('convert failed', cnRel);
    continue;
  }
  console.log('ok', cnRel);
  if (deleteDumps) fs.unlinkSync(dumpPath);
}
