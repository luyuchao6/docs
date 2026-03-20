#!/usr/bin/env node
/**
 * Export Feishu **standalone wiki spreadsheet** pages via select-all + copy + clipboard (TSV).
 *
 * Usage (single):
 *   node scripts/feishu-sheet-clipboard-export.mjs [wikiToken] [--out path.tsv] [--headed] [--wait-ms 12000]
 *
 * Usage (all sheets in manifest → docs/cn):
 *   node scripts/feishu-sheet-clipboard-export.mjs --all [--headed] [--wait-ms 12000]
 *   npm run feishu:scrape-sheets-tsv
 *
 * Manifest: scripts/feishu-wiki-sheet-tsv-manifest.json
 *
 * Requires wiki access in the browser (same as feishu:pull). Use --headed if clipboard stays empty.
 *
 * **Stale clipboard:** If copy from the sheet fails, the browser may return your **system** clipboard
 * (e.g. the `npm run …` line from the terminal). We **clear** the clipboard before each copy and
 * **reject** reads that look like shell commands or lack tabs / multiple lines.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FEISHU_ORIGIN = 'https://lingdongfangcheng.feishu.cn';
const DEFAULT_TOKEN = 'JYUcwEPNCiRAaSkM8kic27JAnDb';
const MANIFEST_PATH = path.join(__dirname, 'feishu-wiki-sheet-tsv-manifest.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  let token = DEFAULT_TOKEN;
  let outPath = '';
  let headed = false;
  let waitMs = 12000;
  let all = false;
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') all = true;
    else if (a === '--headed' || a === '-H') headed = true;
    else if (a === '--out' || a === '-o') outPath = argv[++i] || '';
    else if (a.startsWith('--out=')) outPath = a.slice(6);
    else if (a === '--wait-ms') waitMs = Number(argv[++i]) || waitMs;
    else if (a.startsWith('--wait-ms=')) waitMs = Number(a.slice(10)) || waitMs;
    else if (!a.startsWith('-')) rest.push(a);
  }
  if (rest[0] && /^[A-Za-z0-9]+$/.test(rest[0])) token = rest[0];
  return { token, outPath, headed, waitMs, all };
}

async function readClipboard(page) {
  return page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  });
}

/** Avoid reading stale OS clipboard (e.g. last terminal selection) when copy fails. */
async function clearClipboard(page) {
  await page.evaluate(async () => {
    try {
      await navigator.clipboard.writeText('');
    } catch {
      /* ignore */
    }
  });
}

/**
 * When the sheet does not put data on the clipboard, Chromium may still return the **system**
 * clipboard — often the user’s last copy from the terminal (`npm run …`).
 */
function looksLikeShellGarbage(text) {
  const t = text.trim();
  if (t.length === 0) return true;
  if (/^(npm|yarn|pnpm|npx|bun)\s+/i.test(t) && !t.includes('\t')) return true;
  if (/^node\s+scripts\//i.test(t)) return true;
  if (/^cd\s+/i.test(t) && t.length < 200 && !t.includes('\t')) return true;
  return false;
}

/** True if clipboard content is plausibly sheet copy (TSV / multi-line grid), not terminal noise. */
function looksLikeSheetClipboard(text) {
  if (!text || text.trim().length < 2) return false;
  if (looksLikeShellGarbage(text)) return false;
  if (text.includes('\t')) return true;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length >= 2) return true;
  return false;
}

async function copyFromFrame(page, frame) {
  await clearClipboard(page);
  try {
    await frame.locator('body').click({ timeout: 8000, position: { x: 20, y: 20 } });
  } catch {
    await frame.locator('body').focus().catch(() => {});
  }
  await page.keyboard.press('Control+A');
  await sleep(300);
  await page.keyboard.press('Control+C');
  await sleep(500);
}

/**
 * @returns {Promise<string>} best clipboard text (often TSV)
 */
async function scrapeSheetClipboard(context, token, waitMs) {
  const wikiUrl = `${FEISHU_ORIGIN}/wiki/${token}`;
  const page = await context.newPage();
  let best = '';
  try {
    process.stderr.write(`Opening ${wikiUrl} …\n`);
    await page.goto(wikiUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    for (let t = 0; t < 20; t++) {
      const ready = page.frames().some((f) => {
        const u = f.url() || '';
        return u && !u.startsWith('about:') && u !== wikiUrl;
      });
      if (ready) break;
      if (t % 3 === 0) process.stderr.write(`… waiting for sheet iframe (${t + 1}s)\n`);
      await sleep(1000);
    }
    await sleep(waitMs);

    for (const f of page.frames()) {
      try {
        const o = new URL(f.url()).origin;
        if (o.startsWith('http'))
          await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: o }).catch(() => {});
      } catch {
        /* ignore */
      }
    }

    const frames = page.frames();
    process.stderr.write(`Frames: ${frames.length}\n`);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const u = f.url() || '';
      process.stderr.write(`  [${i}] ${u.slice(0, 100)}${u.length > 100 ? '…' : ''}\n`);
    }

    const ordered = [...frames].sort((a, b) => {
      const score = (u) =>
        /sheet|spreadsheet|sheets|bitable|wiki\/module|drive/.test(u || '') ? 0 : 1;
      return score(a.url()) - score(b.url());
    });

    for (const frame of ordered) {
      const fu = frame.url() || '';
      if (fu === 'about:blank') continue;
      process.stderr.write(`Trying copy on frame: ${fu.slice(0, 80)} …\n`);
      await copyFromFrame(page, frame);
      const clip = await readClipboard(page);
      const text = typeof clip === 'string' ? clip : '';
      if (!looksLikeSheetClipboard(text)) {
        process.stderr.write(
          `  (ignored clipboard: not sheet-like, ${text.length} chars — ${looksLikeShellGarbage(text) ? 'looks like terminal' : 'no tabs / single line'})\n`,
        );
        continue;
      }
      if (text.length > best.length) best = text;
      if (text.includes('\t')) {
        process.stderr.write(`Got TSV-like clipboard (${text.length} chars) from this frame.\n`);
        break;
      }
    }

    if (!looksLikeSheetClipboard(best)) {
      best = '';
      process.stderr.write(
        'No valid sheet data on clipboard (got terminal noise or empty). Clear clipboard before run, use --headed, increase --wait-ms, click the grid first, or ensure you are logged in.\n',
      );
    }

    if (!best) {
      const clip = await readClipboard(page);
      process.stderr.write(`Last raw read (debug): ${JSON.stringify(clip).slice(0, 300)}\n`);
    }
  } finally {
    await page.close();
  }
  return best;
}

async function main() {
  const { token, outPath, headed, waitMs, all } = parseArgs(process.argv);

  const browser = await chromium.launch({
    headless: !headed,
    channel: undefined,
  });
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: FEISHU_ORIGIN,
  });

  try {
    if (all) {
      const rows = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      let failed = 0;
      for (const [wikiToken, cnTsvRel] of rows) {
        const absOut = path.join(ROOT, 'docs', 'cn', cnTsvRel);
        process.stderr.write(`\n=== ${cnTsvRel} (${wikiToken}) ===\n`);
        const best = await scrapeSheetClipboard(context, wikiToken, waitMs);
        if (typeof best === 'string' && looksLikeSheetClipboard(best)) {
          fs.mkdirSync(path.dirname(absOut), { recursive: true });
          const body = best.endsWith('\n') ? best : `${best}\n`;
          fs.writeFileSync(absOut, body, 'utf8');
          process.stderr.write(`Wrote ${absOut} (${body.length} bytes)\n`);
        } else {
          failed++;
          process.stderr.write(`SKIP (empty clipboard): ${cnTsvRel}\n`);
        }
        await sleep(800);
      }
      await browser.close();
      if (failed > 0) process.exit(1);
      return;
    }

    const best = await scrapeSheetClipboard(context, token, waitMs);

    if (typeof best === 'string' && looksLikeSheetClipboard(best)) {
      process.stdout.write(best);
      if (!best.endsWith('\n')) process.stdout.write('\n');
      if (outPath) {
        fs.writeFileSync(outPath, best, 'utf8');
        process.stderr.write(`Wrote ${outPath} (${best.length} bytes)\n`);
      }
    }

    await browser.close();
    if (!looksLikeSheetClipboard(best)) process.exit(1);
  } catch (e) {
    await browser.close();
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
