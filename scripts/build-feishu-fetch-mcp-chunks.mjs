#!/usr/bin/env node
/**
 * Writes JSON files suitable for Playwright MCP browser_run_code `arguments`
 * (one object per chunk: { "code": "async (page) => { ... }" }).
 * Chunk size avoids huge single payloads; code uses no template literals (${)
 * so Cursor message templating does not corrupt URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'feishu-wiki-cn-manifest.json'), 'utf8'));

const FETCH_BODY = String.raw`
  const DEFAULT_SPACE = '7539498339620913154';
  const MANIFEST = __MANIFEST_JSON__;

  await page.goto('https://lingdongfangcheng.feishu.cn/wiki/KOa3wfI8Aiv3xxkmWsrchBPBn5d', {
    waitUntil: 'domcontentloaded',
  });

  const results = [];
  for (const [wikiToken, cnRel] of MANIFEST) {
    const nodeUrl =
      'https://lingdongfangcheng.feishu.cn/space/api/wiki/v2/tree/get_node/?wiki_token=' +
      encodeURIComponent(wikiToken) +
      '&space_id=' +
      DEFAULT_SPACE +
      '&expand_shortcut=true&with_deleted=true';
    const nr = await page.request.get(nodeUrl);
    const nj = await nr.json();
    if (nj.code !== 0) {
      results.push({ wikiToken, cnRel, err: 'get_node', code: nj.code, msg: nj.msg });
      await page.waitForTimeout(300);
      continue;
    }
    const d = nj.data;
    const sid = d.space_id || DEFAULT_SPACE;
    if (d.obj_type !== 22) {
      const title = (d.title || cnRel || '').replace(/\.md$/i, '');
      const stub = JSON.stringify({ stub: true, wikiToken, title, cnRel, obj_type: d.obj_type });
      await page.evaluate(
        (p) => {
          const blob = new Blob([p.json], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'feishu-api--' + p.token + '.json';
          a.click();
        },
        { json: stub, token: wikiToken },
      );
      results.push({ wikiToken, cnRel, stub: true, obj_type: d.obj_type });
      await page.waitForTimeout(500);
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
      const jr = await page.request.get(u);
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
      results.push({ wikiToken, cnRel, err: 'client_vars', cvErr });
      await page.waitForTimeout(400);
      continue;
    }
    const payload = JSON.stringify({ pageId: objToken, wikiToken, spaceId: sid, meta, blockMap });
    await page.evaluate(
      (p) => {
        const blob = new Blob([p.json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'feishu-api--' + p.token + '.json';
        a.click();
      },
      { json: payload, token: wikiToken },
    );
    results.push({ wikiToken, cnRel, ok: true, blocks: Object.keys(blockMap).length });
    await page.waitForTimeout(600);
  }
  return results;
`;

const CHUNK = 5;
const outDir = path.join(__dirname, '.feishu-mcp-chunks');
fs.mkdirSync(outDir, { recursive: true });

for (let i = 0, part = 0; i < manifest.length; i += CHUNK, part++) {
  const slice = manifest.slice(i, i + CHUNK);
  const inner = FETCH_BODY.replace('__MANIFEST_JSON__', JSON.stringify(slice));
  const code = 'async (page) => {\n' + inner + '\n}';
  const file = path.join(outDir, 'chunk-' + String(part).padStart(2, '0') + '.json');
  fs.writeFileSync(file, JSON.stringify({ code }), 'utf8');
  console.log('wrote', file, 'rows', slice.length);
}
