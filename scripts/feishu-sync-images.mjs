#!/usr/bin/env node
/**
 * After `npm run feishu:pull`: scan API dumps for image file tokens, assign basenames
 * `{cnMdBasename}-img-0`, `-img-1`, … (per page, skipping tokens already in manual map),
 * write `feishu-image-token-map.json`, and download PNGs via Feishu cover stream API
 * (same session cookie as the wiki hub).
 *
 * Usage: npm run feishu:sync-images [--force]
 *   --force  re-download even when the target file already exists
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { IMAGE_TOKEN_TO_BASENAME } from './feishu-image-tokens.mjs';
import { collectImageTokensInOrder } from './feishu-image-collect.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mcpDir = path.join(root, '.playwright-mcp');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'feishu-wiki-cn-manifest.json'), 'utf8'));
const assetsDir = path.join(root, 'docs', 'cn', 'assets', 'images');
const mapOut = path.join(__dirname, 'feishu-image-token-map.json');
const HUB = 'https://lingdongfangcheng.feishu.cn/wiki/KOa3wfI8Aiv3xxkmWsrchBPBn5d';

function coverUrl(token) {
  return (
    'https://lingdongfangcheng.feishu.cn/space/api/box/stream/download/v2/cover/' +
    encodeURIComponent(token)
  );
}

function sanitizeSlug(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9.\u4e00-\u9fff_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'page'
  );
}

const force = process.argv.includes('--force');

function buildAutoMap() {
  const autoMap = {};
  const allTokens = []; // every image occurrence (for download set we dedupe later)

  for (const [wikiToken, cnRel] of manifest) {
    const dumpPath = path.join(mcpDir, `feishu-api--${wikiToken}.json`);
    if (!fs.existsSync(dumpPath)) continue;
    let dump;
    try {
      dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    } catch {
      continue;
    }
    if (dump.stub || !dump.blockMap || !dump.pageId) continue;

    const pageSlug = sanitizeSlug(path.basename(cnRel, '.md'));
    const tokens = collectImageTokensInOrder(dump.blockMap, dump.pageId);
    let i = 0;
    for (const tok of tokens) {
      allTokens.push(tok);
      if (IMAGE_TOKEN_TO_BASENAME[tok]) continue;
      if (autoMap[tok]) continue;
      autoMap[tok] = `${pageSlug}-img-${i}`;
      i++;
    }
  }

  return { autoMap, allTokens: [...new Set(allTokens)] };
}

async function main() {
  const { autoMap, allTokens } = buildAutoMap();
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(mapOut, JSON.stringify(autoMap, null, 2) + '\n', 'utf8');
  console.error('Wrote', mapOut, 'entries', Object.keys(autoMap).length, 'unique tokens', allTokens.length);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(HUB, { waitUntil: 'domcontentloaded', timeout: 60000 });

  let wrote = 0;
  let skipped = 0;
  let failed = 0;

  for (const token of allTokens) {
    const base = IMAGE_TOKEN_TO_BASENAME[token] || autoMap[token] || `feishu-${token}`;
    const outFile = path.join(assetsDir, `${base}.png`);
    if (!force && fs.existsSync(outFile) && fs.statSync(outFile).size > 32) {
      skipped++;
      continue;
    }
    const res = await page.request.get(coverUrl(token));
    if (!res.ok()) {
      console.error('HTTP', res.status(), token.slice(0, 12));
      failed++;
      continue;
    }
    const buf = await res.body();
    fs.writeFileSync(outFile, buf);
    wrote++;
  }

  console.error('Images wrote', wrote, 'skipped', skipped, 'failed', failed);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
