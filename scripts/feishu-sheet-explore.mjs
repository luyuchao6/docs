#!/usr/bin/env node
/**
 * Open a **headed** Chromium window on a Feishu **standalone spreadsheet** wiki page and keep it
 * open so you can inspect the DOM / Network / iframes. Prints frame URLs and iframe counts to stderr.
 *
 * For Cursor sessions, **prefer Playwright MCP** for interactive exploration — see
 * **`feishu-mcp-sheet-explore.md`**, then port working strategies to headless scripts.
 *
 * When you are done exploring, press **Enter** in this terminal to close the browser.
 *
 * Usage:
 *   npm run feishu:sheet-explore
 *   npm run feishu:sheet-explore -- --token JYUcwEPNCiRAaSkM8kic27JAnDb --wait-ms 15000
 *   node scripts/feishu-sheet-explore.mjs --pause
 *
 * `--pause` — call `page.pause()` (Playwright Inspector / step-through) instead of stdin wait.
 *
 * Next strategies to try (after you see what loads):
 * - Network tab: filter `sheet` / `spreadsheet` / `open` / `range` / WebSocket for JSON cell APIs.
 * - DOM: sheet may use canvas + overlay; copy may need a specific inner node focused.
 * - Feishu Open Platform: export or Sheets API with `obj_token` (separate from clipboard).
 */
import readline from 'node:readline';
import { chromium } from 'playwright';

const FEISHU_ORIGIN = 'https://lingdongfangcheng.feishu.cn';
const DEFAULT_TOKEN = 'JYUcwEPNCiRAaSkM8kic27JAnDb';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  let token = DEFAULT_TOKEN;
  let waitMs = 15000;
  let usePause = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pause') usePause = true;
    else if (a === '--token') token = argv[++i] || token;
    else if (a.startsWith('--token=')) token = a.slice(8);
    else if (a === '--wait-ms') waitMs = Number(argv[++i]) || waitMs;
    else if (a.startsWith('--wait-ms=')) waitMs = Number(a.slice(10)) || waitMs;
  }
  return { token, waitMs, usePause };
}

async function dumpPageInfo(page) {
  const info = await page.evaluate(() => {
    const iframes = [...document.querySelectorAll('iframe')];
    return {
      title: document.title,
      iframeCount: iframes.length,
      iframeSrcs: iframes.map((el) => (el.getAttribute('src') || '').slice(0, 200)),
    };
  });
  return info;
}

async function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const { token, waitMs, usePause } = parseArgs(process.argv);
  const url = `${FEISHU_ORIGIN}/wiki/${token}`;

  process.stderr.write(`
Feishu sheet explorer
  URL: ${url}
  Wait after load: ${waitMs} ms
  Close: ${usePause ? 'Playwright pause() / inspector' : 'press Enter in this terminal'}

`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1400,900'],
  });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 860 },
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(waitMs);

  process.stderr.write('--- Frames (after wait) ---\n');
  for (let i = 0; i < page.frames().length; i++) {
    const f = page.frames()[i];
    const u = f.url() || '';
    process.stderr.write(`  [${i}] ${u || '(empty)'}\n`);
  }

  const mainInfo = await dumpPageInfo(page);
  process.stderr.write(`\nMain document title: ${mainInfo.title}\n`);
  process.stderr.write(`iframe elements on main document: ${mainInfo.iframeCount}\n`);
  mainInfo.iframeSrcs.forEach((s, i) => {
    process.stderr.write(`  iframe[${i}] src: ${s || '(none)'}\n`);
  });

  process.stderr.write(`
--- What to check in DevTools (F12) ---
  • Application → Frames: which frame hosts the grid?
  • Network: XHR/fetch to *sheet*, *spreadsheet*, *open*, *drive*, *bitable*, ws://
  • Elements: search for [role="grid"], canvas, data attributes on cells

`);

  if (usePause) {
    process.stderr.write('Calling page.pause() — use Playwright Inspector / resume when done.\n');
    await page.pause();
  } else {
    await waitForEnter('Press Enter to close the browser… ');
  }

  await browser.close();
  process.stderr.write('Done.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
