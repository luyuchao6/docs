# One Feishu wiki page → API dump (Playwright MCP)

Use this when **`feishu:pull-one`** fails with `Login Required` / `NodePermFail`: the headless script has no cookies, but **Playwright MCP** can reuse a browser where you sign in.

## 1. Open the wiki page in MCP

- **Navigate** to the page URL from the Feishu sidebar or address bar. Example (4.2.4 **SDK-python 环境配置**):  
  `https://lingdongfangcheng.feishu.cn/wiki/I8wnwDW9riOkKJk2sLAcsN8Onff`

## 2. Sign in

- Complete Feishu login (or SSO) **in that same MCP browser** until you see the **document content**, not the login form.

## 3. Run `browser_run_code` (Playwright MCP)

Server: **`project-0-ht-dev-docs-playwright`**, tool: **`browser_run_code`**.

The MCP VM may not support `require` / `fs` in the snippet. Prefer returning the JSON **string** from `page.evaluate` only, then pipe into:

```bash
node scripts/write-feishu-api-dump-from-stdin.mjs <wiki_token> < dump.txt
```

Or use **`npm run feishu:pull-one -- <wiki_token>`** from the repo (with **`FEISHU_PLAYWRIGHT_USER_DATA`** if needed).

Replace `wikiToken` in the evaluate block with your page’s token (from the `/wiki/<token>` URL).

```javascript
async (page) => {
  const wikiToken = 'I8wnwDW9riOkKJk2sLAcsN8Onff';
  const DEFAULT_SPACE = '7539498339620913154';
  const payload = await page.evaluate(async ({ wikiToken, DEFAULT_SPACE }) => {
    const nodeUrl =
      'https://lingdongfangcheng.feishu.cn/space/api/wiki/v2/tree/get_node/?wiki_token=' +
      encodeURIComponent(wikiToken) +
      '&space_id=' +
      DEFAULT_SPACE +
      '&expand_shortcut=true&with_deleted=true';
    const nr = await fetch(nodeUrl, { credentials: 'include' });
    const nj = await nr.json();
    if (nj.code !== 0) {
      return JSON.stringify({ stub: true, wikiToken, err: 'get_node', code: nj.code, msg: nj.msg });
    }
    const d = nj.data;
    const sid = d.space_id || DEFAULT_SPACE;
    if (d.obj_type !== 22) {
      const title = (d.title || wikiToken).replace(/\.md$/i, '');
      return JSON.stringify({ stub: true, wikiToken, title, obj_type: d.obj_type });
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
        return JSON.stringify({ stub: true, wikiToken, err: 'client_vars', cvErr: j });
      }
      Object.assign(blockMap, j.data.block_map || {});
      const mm = j.data.meta_map;
      if (mm && mm[objToken]) meta = mm[objToken];
      if (!j.data.has_more) break;
      cursor = j.data.cursor;
      if (!cursor) break;
    }
    return JSON.stringify({ pageId: objToken, wikiToken, spaceId: sid, meta, blockMap });
  }, { wikiToken, DEFAULT_SPACE });
  return { payload };
}
```

## 4. Convert to Chinese markdown only

From repo root (token must be in `feishu-wiki-cn-manifest.json`):

```bash
npm run feishu:convert-one-cn -- I8wnwDW9riOkKJk2sLAcsN8Onff
```

## 5. Images (optional)

Run **`npm run feishu:sync-images`**, then if links show `feishu-*.png` instead of `{slug}-img-N.png`:

```bash
node scripts/fix-feishu-image-links-in-md.mjs docs/cn/04-SDK/<that-file>.md
```
