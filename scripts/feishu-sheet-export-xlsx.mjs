#!/usr/bin/env node
/**
 * Download Feishu spreadsheet wiki pages (from feishu-wiki-sheet-tsv-manifest.json),
 * decode cell blocks to grids, write one .xlsx per wiki under docs/cn/ (parallel to .tsv paths).
 *
 * Prerequisites:
 *   npm install
 *   npm run feishu:sheet-extract-schema
 *   npx playwright install chromium
 *
 * Usage:
 *   node scripts/feishu-sheet-export-xlsx.mjs
 *   node scripts/feishu-sheet-export-xlsx.mjs --wiki JYUcwEPNCiRAaSkM8kic27JAnDb
 *   node scripts/feishu-sheet-export-xlsx.mjs --headed --dry-run
 *
 * Login: use --headed once, or FEISHU_PLAYWRIGHT_USER_DATA=/path/to/profile
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import {
  decodeGzipBase64As,
  decodeGzipBase64Block,
} from './feishu-sheet-protobuf-block-decode.mjs';
import {
  collectMergeRangesBySheet,
  commandsToSheetGrids,
} from './feishu-sheet-commands-to-grid.mjs';

/** gzipResource often decodes as `Commands`; merge metadata may use `SimpleCommands`. */
function mergeRangesFromGzipResource(b64) {
  let map = new Map();
  try {
    const j = decodeGzipBase64Block(b64);
    map = collectMergeRangesBySheet(j);
  } catch (e) {
    console.error('gzipResource as Commands failed:', e.message);
  }
  let n = 0;
  for (const a of map.values()) n += a.length;
  if (n > 0) return map;
  try {
    const j = decodeGzipBase64As(b64, 'SimpleCommands');
    return collectMergeRangesBySheet(j);
  } catch (e) {
    console.error('gzipResource as SimpleCommands failed:', e.message);
    return map;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const MANIFEST = path.join(__dirname, 'feishu-wiki-sheet-tsv-manifest.json');
const CLIENT_VARS_URL =
  'https://lingdongfangcheng.feishu.cn/space/api/v3/sheet/client_vars';

function parseArgs(argv) {
  let headed = false;
  let dryRun = false;
  let wiki = null;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') headed = true;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--wiki') wiki = argv[++i];
    else if (!a.startsWith('--')) pos.push(a);
  }
  return { headed, dryRun, wiki, pos };
}

function parseGzipBlockMeta(snapshot) {
  const b64 = snapshot.gzipBlockMeta;
  if (!b64) return {};
  return JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
}

function collectNeededBlockIds(meta) {
  const ids = new Set();
  for (const sheet of Object.values(meta)) {
    for (const m of sheet.cellBlockMetas || []) {
      if (m.blockId) ids.add(m.blockId);
    }
  }
  return ids;
}

/**
 * Merge extra tab responses until every blockId from gzipBlockMeta is present.
 */
async function captureMergedClientVars(page, wikiUrl) {
  let postBody = null;
  const onReq = (req) => {
    if (
      req.url().includes('/space/api/v3/sheet/client_vars') &&
      req.method() === 'POST'
    ) {
      try {
        postBody = JSON.parse(req.postData() || '{}');
      } catch {
        /* */
      }
    }
  };
  page.on('request', onReq);

  const respPromise = page.waitForResponse(
    (r) =>
      r.url().includes('/space/api/v3/sheet/client_vars') &&
      r.request().method() === 'POST' &&
      r.status() === 200,
    { timeout: 120000 }
  );

  await page.goto(wikiUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });

  const resp = await respPromise;
  page.off('request', onReq);

  const first = await resp.json();
  if (!postBody) {
    throw new Error('Could not capture client_vars POST body (unexpected)');
  }

  const merged = JSON.parse(JSON.stringify(first));
  const snap = merged.data?.snapshot;
  if (!snap) throw new Error('client_vars response missing data.snapshot');

  const blocks = { ...(snap.blocks || {}) };
  const meta = parseGzipBlockMeta(snap);
  const needed = collectNeededBlockIds(meta);
  const have = () => [...needed].every((id) => blocks[id]);

  const cookies = await page.context().cookies('https://lingdongfangcheng.feishu.cn');
  const csrf = cookies.find((c) => c.name === '_csrf_token')?.value ?? '';

  if (!have()) {
    for (const sheetId of Object.keys(meta)) {
      const body = { ...postBody, sheetRange: { sheetId } };
      const j = await page.evaluate(
        async ({ url, body: b, csrf: tok }) => {
          const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFTOKEN': tok,
            },
            body: JSON.stringify(b),
          });
          return res.json();
        },
        { url: CLIENT_VARS_URL, body, csrf }
      );
      if (j.code === 0 && j.data?.snapshot?.blocks) {
        Object.assign(blocks, j.data.snapshot.blocks);
      }
      if (have()) break;
    }
  }

  merged.data.snapshot.blocks = blocks;
  return merged;
}

function clientVarsToSheetTabs(clientVarsJson) {
  const snap = clientVarsJson.data.snapshot;
  const blocks = snap.blocks || {};
  const meta = parseGzipBlockMeta(snap);
  const tabs = [];

  const mergeBySheet = snap.gzipResource
    ? mergeRangesFromGzipResource(snap.gzipResource)
    : new Map();

  for (const sheetId of Object.keys(meta)) {
    const bm = meta[sheetId].cellBlockMetas?.[0];
    if (!bm?.blockId) continue;
    const b64 = blocks[bm.blockId];
    if (!b64) {
      throw new Error(
        `Missing block payload for ${bm.blockId} (sheet ${sheetId}). Try --headed / login.`
      );
    }
    const commandsJson = decodeGzipBase64Block(b64);
    const merges = mergeBySheet.get(sheetId) ?? [];
    const grids = commandsToSheetGrids(commandsJson, merges);
    const grid = grids[0]?.grid;
    if (!grid) {
      throw new Error(`No grid in block ${bm.blockId}`);
    }
    const name = sanitizeSheetName(sheetId);
    tabs.push({ name, grid });
  }

  return tabs;
}

function sanitizeSheetName(name) {
  const bad = /[:\\/?*[\]]/g;
  let s = String(name).replace(bad, '_').slice(0, 31);
  if (!s) s = 'Sheet';
  return s;
}

function writeWorkbook(tabs, outPath) {
  const wb = XLSX.utils.book_new();
  for (const { name, grid } of tabs) {
    const ws = XLSX.utils.aoa_to_sheet(grid);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath);
}

async function main() {
  const { headed, dryRun, wiki: wikiFilter } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rows = wikiFilter
    ? manifest.filter(([t]) => t === wikiFilter)
    : manifest;
  if (rows.length === 0) {
    console.error('No manifest rows (check --wiki token)');
    process.exit(1);
  }

  const profileDir = process.env.FEISHU_PLAYWRIGHT_USER_DATA || null;
  let browser = null;
  let context;
  if (profileDir) {
    fs.mkdirSync(profileDir, { recursive: true });
    context = await chromium.launchPersistentContext(profileDir, {
      headless: !headed,
    });
  } else {
    browser = await chromium.launch({ headless: !headed });
    context = await browser.newContext();
  }

  const page = context.pages()[0] ?? (await context.newPage());

  for (const [wikiToken, tsvRel] of rows) {
    const xlsxRel = tsvRel.replace(/\.tsv$/i, '.xlsx');
    const outPath = path.join(root, 'docs/cn', xlsxRel);
    const wikiUrl = `https://lingdongfangcheng.feishu.cn/wiki/${wikiToken}`;
    process.stderr.write(`${xlsxRel} … `);

    if (dryRun) {
      console.error('dry-run');
      continue;
    }

    try {
      const merged = await captureMergedClientVars(page, wikiUrl);

      const dumpPath = path.join(
        root,
        '.playwright-mcp',
        `sheet-export--${wikiToken}.json`
      );
      fs.mkdirSync(path.dirname(dumpPath), { recursive: true });
      fs.writeFileSync(dumpPath, JSON.stringify(merged, null, 2), 'utf8');

      const tabs = clientVarsToSheetTabs(merged);
      writeWorkbook(tabs, outPath);
      console.error(`ok (${tabs.length} sheet(s) → ${outPath})`);
    } catch (e) {
      console.error('FAIL', e.message);
    }

    await page.waitForTimeout(400);
  }

  await context.close();
  if (browser) await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
