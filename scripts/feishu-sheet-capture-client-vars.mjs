#!/usr/bin/env node
/**
 * Open a Feishu wiki page that embeds a spreadsheet, wait for the real
 * POST /space/api/v3/sheet/client_vars response, and save the JSON body.
 *
 * This avoids hand-copying DevTools and does not require guessing memberId —
 * the browser session performs the same request the UI does.
 *
 * Prerequisites: npm install, npx playwright install chromium
 *
 * Usage:
 *   node scripts/feishu-sheet-capture-client-vars.mjs JYUcwEPNCiRAaSkM8kic27JAnDb
 *   node scripts/feishu-sheet-capture-client-vars.mjs --url 'https://lingdongfangcheng.feishu.cn/wiki/TOKEN'
 *   node scripts/feishu-sheet-capture-client-vars.mjs TOKEN --headed --out ./vars.json
 *
 * Reuse a logged-in profile (recommended after one --headed login):
 *   FEISHU_PLAYWRIGHT_USER_DATA=/path/to/profile npm run feishu:sheet-capture-client-vars -- TOKEN
 *
 * Output default: .playwright-mcp/sheet-client-vars--{wikiToken}.json
 *
 * Then decode one block:
 *   node scripts/feishu-sheet-decode-commands.mjs --from-client-vars-json .playwright-mcp/sheet-client-vars--TOKEN.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mcpDir = path.join(root, '.playwright-mcp');

function parseArgs(argv) {
  let headed = false;
  let out = null;
  let url = null;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') headed = true;
    else if (a === '--out') out = argv[++i];
    else if (a === '--url') url = argv[++i];
    else if (!a.startsWith('--')) pos.push(a);
  }
  return { headed, out, url, wikiToken: pos[0] };
}

function wikiUrlFromToken(token) {
  return `https://lingdongfangcheng.feishu.cn/wiki/${token}`;
}

function extractWikiToken(u) {
  const m = String(u).match(/\/wiki\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function main() {
  const { headed, out, url: urlArg, wikiToken: tokenArg } = parseArgs(
    process.argv.slice(2)
  );
  let wikiUrl = urlArg;
  let wikiToken = tokenArg ? extractWikiToken(tokenArg) || tokenArg : null;
  if (wikiUrl && !wikiToken) wikiToken = extractWikiToken(wikiUrl);
  if (!wikiUrl && wikiToken) wikiUrl = wikiUrlFromToken(wikiToken);
  if (!wikiUrl || !wikiToken) {
    console.error(
      'Usage: feishu-sheet-capture-client-vars.mjs <wiki_token>\n' +
        '   or: --url https://lingdongfangcheng.feishu.cn/wiki/<wiki_token> [--out file] [--headed]'
    );
    process.exit(1);
  }

  fs.mkdirSync(mcpDir, { recursive: true });
  const outFile =
    out ||
    path.join(mcpDir, `sheet-client-vars--${wikiToken}.json`);

  const profileDir = process.env.FEISHU_PLAYWRIGHT_USER_DATA || null;
  let browser = null;
  let context;
  let page;
  if (profileDir) {
    fs.mkdirSync(profileDir, { recursive: true });
    context = await chromium.launchPersistentContext(profileDir, {
      headless: !headed,
    });
    page = context.pages()[0] ?? (await context.newPage());
  } else {
    browser = await chromium.launch({ headless: !headed });
    context = await browser.newContext();
    page = await context.newPage();
  }

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

  let response;
  try {
    response = await respPromise;
  } catch (e) {
    await context.close();
    if (browser) await browser.close();
    console.error(
      'Timed out waiting for sheet client_vars. Is this page a spreadsheet wiki? Are you logged in? Try --headed or FEISHU_PLAYWRIGHT_USER_DATA'
    );
    throw e;
  }

  const json = await response.json();
  fs.writeFileSync(outFile, JSON.stringify(json, null, 2), 'utf8');

  const blocks =
    json?.data?.snapshot?.blocks &&
    Object.keys(json.data.snapshot.blocks);
  console.error(
    `Wrote ${outFile}${blocks ? ` (${blocks.length} block(s): ${blocks.join(', ')})` : ''}`
  );
  console.error(`code=${json?.code} msg=${json?.msg ?? ''}`);

  await context.close();
  if (browser) await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
