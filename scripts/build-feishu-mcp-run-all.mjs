#!/usr/bin/env node
/**
 * One Playwright MCP browser_run_code payload: fetch entire CN manifest via in-page fetch,
 * download feishu-api--{wikiToken}.json to .playwright-mcp/ (browser download folder).
 *
 * Run: node scripts/build-feishu-mcp-run-all.mjs
 * Then: Playwright MCP browser_run_code with the JSON from scripts/.feishu-mcp-run-all.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'feishu-wiki-cn-manifest.json'), 'utf8'));
const manifestLiteral = JSON.stringify(manifest);

const code = `async (page) => {
  const HUB = 'https://lingdongfangcheng.feishu.cn/wiki/KOa3wfI8Aiv3xxkmWsrchBPBn5d';
  const MANIFEST = ${manifestLiteral};
  await page.goto(HUB, { waitUntil: 'domcontentloaded' });
  return await page.evaluate(async (pairs) => {
    const DEFAULT_SPACE = '7539498339620913154';
    const results = [];
    function download(filename, text) {
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    function wait(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }
    for (const [wikiToken, cnRel] of pairs) {
      const nodeUrl =
        'https://lingdongfangcheng.feishu.cn/space/api/wiki/v2/tree/get_node/?wiki_token=' +
        encodeURIComponent(wikiToken) +
        '&space_id=' +
        DEFAULT_SPACE +
        '&expand_shortcut=true&with_deleted=true';
      const nr = await fetch(nodeUrl, { credentials: 'include' });
      const nj = await nr.json();
      if (nj.code !== 0) {
        results.push({ wikiToken, cnRel, err: 'get_node', code: nj.code, msg: nj.msg });
        await wait(300);
        continue;
      }
      const d = nj.data;
      const sid = d.space_id || DEFAULT_SPACE;
      if (d.obj_type !== 22) {
        const title = (d.title || cnRel || '').replace(/\\.md$/i, '');
        const stub = JSON.stringify({
          stub: true,
          wikiToken: wikiToken,
          title: title,
          cnRel: cnRel,
          obj_type: d.obj_type,
        });
        download('feishu-api--' + wikiToken + '.json', stub);
        results.push({ wikiToken, cnRel, stub: true, obj_type: d.obj_type });
        await wait(500);
        continue;
      }
      const objToken = d.obj_token;
      const blockMap = {};
      let meta = null;
      let cvErr = null;
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
          cvErr = j;
          break;
        }
        Object.assign(blockMap, j.data.block_map || {});
        const mm = j.data.meta_map;
        if (mm && mm[objToken]) meta = mm[objToken];
        if (!j.data.has_more) break;
        cursor = j.data.cursor;
        if (!cursor) break;
      }
      if (cvErr) {
        results.push({ wikiToken, cnRel, err: 'client_vars', cvErr: cvErr });
        await wait(400);
        continue;
      }
      const payload = JSON.stringify({
        pageId: objToken,
        wikiToken: wikiToken,
        spaceId: sid,
        meta: meta,
        blockMap: blockMap,
      });
      download('feishu-api--' + wikiToken + '.json', payload);
      results.push({ wikiToken, cnRel, ok: true, blocks: Object.keys(blockMap).length });
      await wait(600);
    }
    return results;
  }, MANIFEST);
}`;

const out = path.join(__dirname, '.feishu-mcp-run-all.json');
fs.writeFileSync(out, JSON.stringify({ code }), 'utf8');
console.log('wrote', out, 'bytes', fs.statSync(out).size);
