#!/usr/bin/env node
/**
 * Phase 1 — download only: open public wiki hub, fetch each manifest page via in-page fetch,
 * write .playwright-mcp/feishu-api--{wikiToken}.json (same shape as MCP browser scrape).
 * Does not run the markdown converter; use apply-feishu-api-dumps.mjs (npm run feishu:dump_to_markdown) for phase 2.
 *
 * Usage: node scripts/feishu-pull-wiki-playwright.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mcpDir = path.join(root, '.playwright-mcp');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'feishu-wiki-cn-manifest.json'), 'utf8'));

const HUB = 'https://lingdongfangcheng.feishu.cn/wiki/KOa3wfI8Aiv3xxkmWsrchBPBn5d';
const DEFAULT_SPACE = '7539498339620913154';

fs.mkdirSync(mcpDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(HUB, { waitUntil: 'domcontentloaded', timeout: 60000 });

for (const [wikiToken, cnRel] of manifest) {
  const outFile = path.join(mcpDir, `feishu-api--${wikiToken}.json`);
  process.stderr.write(`${cnRel} … `);
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
  if (j.stub) console.error('stub', j.obj_type ?? j.err);
  else console.error(j.blockMap ? Object.keys(j.blockMap).length + ' blocks' : 'ok');
  await page.waitForTimeout(400);
}

await browser.close();
console.error('done →', mcpDir);
