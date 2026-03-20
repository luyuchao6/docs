#!/usr/bin/env node
/**
 * Emits one JSON line per manifest row: { "wikiToken", "cnRel", "arguments": { "code": "..." } }
 * for Playwright MCP browser_run_code. Each snippet is small to avoid MCP argument limits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'feishu-wiki-cn-manifest.json'), 'utf8'));

const HUB = 'KOa3wfI8Aiv3xxkmWsrchBPBn5d';
const DEFAULT_SPACE = '7539498339620913154';

function makeSnippet(wikiToken) {
  return [
    'async (page) => {',
    "  const DEFAULT_SPACE = '" + DEFAULT_SPACE + "';",
    "  const wikiToken = '" + wikiToken + "';",
    "  await page.goto('https://lingdongfangcheng.feishu.cn/wiki/" + HUB + "', { waitUntil: 'domcontentloaded' });",
    '  const nodeUrl =',
    "    'https://lingdongfangcheng.feishu.cn/space/api/wiki/v2/tree/get_node/?wiki_token=' +",
    '    encodeURIComponent(wikiToken) +',
    "    '&space_id=' + DEFAULT_SPACE + '&expand_shortcut=true&with_deleted=true';",
    '  const nr = await page.request.get(nodeUrl);',
    '  const nj = await nr.json();',
    "  if (nj.code !== 0) return { err: 'get_node', wikiToken: wikiToken, code: nj.code, msg: nj.msg };",
    '  const d = nj.data;',
    '  const sid = d.space_id || DEFAULT_SPACE;',
    '  if (d.obj_type !== 22) {',
    "    const title = (d.title || wikiToken).replace(/\\.md$/i, '');",
    '    const stub = JSON.stringify({',
    "      stub: true,",
    '      wikiToken: wikiToken,',
    '      title: title,',
    '      obj_type: d.obj_type,',
    '    });',
    '    await page.evaluate(',
    '      (p) => {',
    "        const blob = new Blob([p.json], { type: 'application/json' });",
    "        const a = document.createElement('a');",
    '        a.href = URL.createObjectURL(blob);',
    "        a.download = 'feishu-api--' + p.token + '.json';",
    '        a.click();',
    '      },',
    '      { json: stub, token: wikiToken },',
    '    );',
    "    return { stub: true, wikiToken: wikiToken, obj_type: d.obj_type };",
    '  }',
    '  const objToken = d.obj_token;',
    '  const blockMap = {};',
    '  let meta = null;',
    '  let cvErr = null;',
    "  let cursor = '';",
    '  for (let guard = 0; guard < 120; guard++) {',
    '    let u =',
    "      'https://lingdongfangcheng.feishu.cn/space/api/docx/pages/client_vars?id=' +",
    '      encodeURIComponent(objToken) +',
    "      '&mode=7&limit=350&wiki_space_id=' +",
    '      encodeURIComponent(sid) +',
    "      '&container_type=wiki2.0&container_id=' +",
    '      encodeURIComponent(wikiToken);',
    "    if (cursor) u += '&cursor=' + encodeURIComponent(cursor);",
    '    const jr = await page.request.get(u);',
    '    const j = await jr.json();',
    '    if (j.code !== 0) {',
    '      cvErr = j;',
    '      break;',
    '    }',
    '    Object.assign(blockMap, j.data.block_map || {});',
    '    const mm = j.data.meta_map;',
    '    if (mm && mm[objToken]) meta = mm[objToken];',
    '    if (!j.data.has_more) break;',
    '    cursor = j.data.cursor;',
    '    if (!cursor) break;',
    '  }',
    '  if (cvErr) return { err: ' + JSON.stringify('client_vars') + ', wikiToken: wikiToken, cvErr: cvErr };',
    '  const payload = JSON.stringify({',
    '    pageId: objToken,',
    '    wikiToken: wikiToken,',
    '    spaceId: sid,',
    '    meta: meta,',
    '    blockMap: blockMap,',
    '  });',
    '  await page.evaluate(',
    '    (p) => {',
    "      const blob = new Blob([p.json], { type: 'application/json' });",
    "      const a = document.createElement('a');",
    '      a.href = URL.createObjectURL(blob);',
    "      a.download = 'feishu-api--' + p.token + '.json';",
    '      a.click();',
    '    },',
    '    { json: payload, token: wikiToken },',
    '  );',
    '  return { ok: true, wikiToken: wikiToken, blocks: Object.keys(blockMap).length };',
    '}',
  ].join('\n');
}

const outDir = path.join(__dirname, '.feishu-mcp-per-page');
fs.mkdirSync(outDir, { recursive: true });

for (const [wikiToken, cnRel] of manifest) {
  const code = makeSnippet(wikiToken);
  const args = JSON.stringify({ code });
  fs.writeFileSync(path.join(outDir, wikiToken + '.json'), args, 'utf8');
  if (args.length > 3500) console.warn('large', wikiToken, args.length, cnRel);
}
console.log('wrote', manifest.length, 'files to', outDir);
