#!/usr/bin/env node
/**
 * Fetch a single wiki page via the same get_node + client_vars flow as
 * feishu-pull-wiki-playwright.mjs. Writes one dump JSON only — does not touch
 * other dumps or run the markdown converter.
 *
 * Usage:
 *   node scripts/feishu-pull-one-wiki-page.mjs <wiki_token>
 *   node scripts/feishu-pull-one-wiki-page.mjs <wiki_token> --headed
 *
 * If `get_node` returns NodePermFail (920004012), the page is not visible to an
 * anonymous session. Use a logged-in Chromium profile (same as sheet export):
 *
 *   FEISHU_PLAYWRIGHT_USER_DATA=/path/to/chromium-profile \\
 *     node scripts/feishu-pull-one-wiki-page.mjs <wiki_token> --headed
 *
 * Sign in to Feishu once in the headed window, then re-run without --headed if desired.
 *
 * Optional: set OUT=path/to/out.json to override output path (default:
 * .playwright-mcp/feishu-api--{wikiToken}.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mcpDir = path.join(root, '.playwright-mcp');

const DEFAULT_SPACE = '7539498339620913154';

const args = process.argv.slice(2).filter((a) => a !== '--headed');
const headed = process.argv.includes('--headed');
const wikiToken = args[0];
if (!wikiToken) {
  console.error('Usage: node scripts/feishu-pull-one-wiki-page.mjs <wiki_token> [--headed]');
  process.exit(1);
}

const outFile =
  process.env.OUT ||
  path.join(mcpDir, `feishu-api--${wikiToken}.json`);

fs.mkdirSync(mcpDir, { recursive: true });

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

const wikiUrl = `https://lingdongfangcheng.feishu.cn/wiki/${wikiToken}`;
await page.goto(wikiUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

const cnRel = `one-off/${wikiToken}`;
process.stderr.write(`${wikiToken} … `);

const payload = await page.evaluate(
  async ({ wikiToken, DEFAULT_SPACE, cnRel: relPath }) => {
    const nodeUrl =
      'https://lingdongfangcheng.feishu.cn/space/api/wiki/v2/tree/get_node/?wiki_token=' +
      encodeURIComponent(wikiToken) +
      '&space_id=' +
      DEFAULT_SPACE +
      '&expand_shortcut=true&with_deleted=true';
    const nr = await fetch(nodeUrl, { credentials: 'include' });
    const nj = await nr.json();
    if (nj.code !== 0) {
      return JSON.stringify({
        stub: true,
        wikiToken,
        title: relPath || wikiToken,
        err: 'get_node',
        code: nj.code,
        msg: nj.msg,
      });
    }
    const d = nj.data;
    const sid = d.space_id || DEFAULT_SPACE;
    if (d.obj_type !== 22) {
      const title = (d.title || wikiToken).replace(/\.md$/i, '');
      return JSON.stringify({
        stub: true,
        wikiToken,
        title,
        cnRel: relPath || '',
        obj_type: d.obj_type,
      });
    }
    const objToken = d.obj_token;
    const blockMap = {};
    let meta = null;
    let cursor = '';
    for (let guard = 0; guard < 120; guard++) {
      let u =
        'https://lingdongfangcheng.feishu.cn/space/api/docx/pages/client_vars?id=' +
        encodeURIComponent(objToken) +
        '&mode=7&limit=350&wiki_space_id=' +
        encodeURIComponent(sid) +
        '&container_type=wiki2.0&container_id=' +
        encodeURIComponent(wikiToken);
      if (cursor) u += '&cursor=' + encodeURIComponent(cursor);
      const jr = await fetch(u, { credentials: 'include' });
      const j = await jr.json();
      if (j.code !== 0) {
        return JSON.stringify({
          stub: true,
          wikiToken,
          err: 'client_vars',
          cvErr: j,
        });
      }
      Object.assign(blockMap, j.data.block_map || {});
      const mm = j.data.meta_map;
      if (mm && mm[objToken]) meta = mm[objToken];
      if (!j.data.has_more) break;
      cursor = j.data.cursor;
      if (!cursor) break;
    }
    return JSON.stringify({
      pageId: objToken,
      wikiToken,
      spaceId: sid,
      meta,
      blockMap,
    });
  },
  { wikiToken, DEFAULT_SPACE, cnRel },
);

fs.writeFileSync(outFile, payload, 'utf8');
const j = JSON.parse(payload);
if (j.stub) {
  console.error('stub', j.err || j.obj_type, j.code ?? '', j.msg ?? '');
  if (j.code === 920004012 && j.msg === 'NodePermFail') {
    console.error(
      '\nHint: this page requires a logged-in Feishu session. Set FEISHU_PLAYWRIGHT_USER_DATA to a Chromium user-data dir, open the wiki once with --headed and sign in, then re-run.\n'
    );
  }
  if (browser) await browser.close();
  else await context.close();
  process.exit(2);
}
console.error(j.blockMap ? Object.keys(j.blockMap).length + ' blocks' : 'ok');
console.error('wrote', outFile);

if (browser) await browser.close();
else await context.close();
