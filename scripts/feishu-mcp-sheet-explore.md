# Feishu spreadsheet wiki — interactive exploration (Playwright MCP)

Use the **Playwright MCP** server in Cursor for **live** exploration: navigate, snapshot, run snippets, and inspect network. When a strategy works (DOM selectors, internal API shape, clipboard rules), **port it** to a headless script under `scripts/` (e.g. extend `feishu-sheet-clipboard-export.mjs` or add a new fetch-based exporter).

## MCP server

- **Identifier:** `project-0-ht-dev-docs-playwright` (see `mcps/project-0-ht-dev-docs-playwright/SERVER_METADATA.json` in the Cursor project).
- **Tools:** `browser_navigate`, `browser_snapshot`, `browser_run_code`, `browser_evaluate`, `browser_click`, `browser_press_key`, `browser_network_requests`, `browser_wait_for`, `browser_tabs`, etc.

If tools are missing, enable the Playwright MCP server in **Cursor Settings → MCP**.

## Suggested exploration loop

1. **`browser_navigate`** — open a standalone sheet wiki page, e.g.  
   `https://lingdongfangcheng.feishu.cn/wiki/JYUcwEPNCiRAaSkM8kic27JAnDb`  
   (5.3 寄存器表; other tokens: `scripts/feishu-wiki-sheet-tsv-manifest.json`).

2. **Wait for embed** — sheet iframes often load after the shell. Use **`browser_wait_for`** (time or selector) or repeat **`browser_snapshot`** until the tree changes.

3. **`browser_snapshot`** — see roles, iframes, buttons; pick refs for clicks if you need to focus the grid.

4. **`browser_network_requests`** — set `includeStatic: false` first; look for XHR/fetch/WebSocket to `sheet`, `spreadsheet`, `drive`, `bitable`, `open`, `range`, etc. Copy URL patterns and response shapes for a **headless** `page.request` or `fetch` (with cookies) later.

5. **`browser_run_code`** — run small `async (page) => { ... }` snippets, for example:

   ```js
   async (page) => {
     return page.frames().map((f) => f.url());
   }
   ```

   ```js
   async (page) => {
     return await page.evaluate(() => ({
       title: document.title,
       iframes: [...document.querySelectorAll('iframe')].map((el) => el.getAttribute('src')),
     }));
   }
   ```

6. **Clipboard / keyboard** — if testing copy: grant permissions may be required in real Chromium; use **`browser_press_key`** after focusing the sheet (click via snapshot ref). Then **`browser_evaluate`** `() => navigator.clipboard.readText()` may work depending on permissions.

7. **Iterate** — adjust waits, tab into iframe, or follow API findings.

## After you find a strategy

- Document the **exact steps** (URLs, headers, body) or **selectors** in this file or a PR description.
- Implement **`scripts/feishu-sheet-*.mjs`** headless: reuse patterns from `feishu-pull-wiki-playwright.mjs` (browser context + cookies) or pure `fetch` if the API is cookie-authenticated.

## CLI fallback (no MCP)

- `npm run feishu:sheet-explore` — headed Chromium + stdin pause + stderr frame dump (`scripts/feishu-sheet-explore.mjs`).

## Findings (MCP session, 5.3 寄存器表)

Session: **`browser_navigate`** → `https://lingdongfangcheng.feishu.cn/wiki/JYUcwEPNCiRAaSkM8kic27JAnDb` — sheet UI loads (tabs, A1, Menu/Wrap/Filter, “View Only”).

### Frames (`browser_run_code`)

`page.frames()` reported **only the top URL** plus **`about:blank`** for three child frames — the grid is mostly **in-page** (canvas / same document), not separate navigable iframe URLs. So **clipboard focus** and **in-app copy** must target the **main** sheet surface, not a child frame URL.

### Network (`browser_network_requests`, `includeStatic: false`)

Useful **same-origin** calls on `lingdongfangcheng.feishu.cn`:

| Method | Path | Notes |
|--------|------|--------|
| **POST** | `/space/api/v3/sheet/client_vars` | **Sheet analogue of docx `client_vars`** — primary candidate for headless cell data (capture **request body** from DevTools or HAR). |
| GET | `/space/api/v2/sheet/complement_formulas/` | 200 |
| GET | `/space/api/meta/?token={obj_token}&type=3&...` | Confirms **`obj_token`** and title; **`data.url`** may be `…/sheets/{token}` |

**`obj_token`** for this page (from network / meta): `K2GQsvVcAhmETntHnPjcsgSEnq3` (`type=3` = sheet). Resolve for other wikis via existing **`get_node`** (`obj_token`) in `feishu-pull-wiki-playwright.mjs`.

**Authenticated `page.request.get`** to `meta` returned **200** with JSON (verified in MCP).

### Headless direction

1. After **`get_node`**, use **`obj_token`** + cookie session.
2. **POST** `sheet/client_vars` with the same body the web app sends (inspect one HAR from the browser).
3. Parse response for cell tables / blocks — then write TSV or markdown without clipboard.

### `sheet/client_vars` — verified JSON API (MCP)

The web client loads sheet state via **same-origin** JSON:

- **URL:** `POST https://lingdongfangcheng.feishu.cn/space/api/v3/sheet/client_vars`
- **Auth:** session cookies (same as wiki login) plus **CSRF**:
  - Header: **`X-CSRFTOKEN`** = value of the **`_csrf_token`** cookie (not `swp_csrf_token`).
  - Without it: **`403`** `csrf token error`. With wrong body but correct CSRF: **`400`** `Parameter Error`.

**Request body** (captured via `page.route` on reload — **not** `{ token, obj_type }`):

```json
{
  "memberId": 32972002204739,
  "schemaVersion": 9,
  "openType": 0,
  "token": "K2GQsvVcAhmETntHnPjcsgSEnq3",
  "sheetRange": { "sheetId": "" },
  "clientVersion": "v0.0.1"
}
```

- **`token`:** spreadsheet **`obj_token`** from `get_node` / meta (`type=3`).
- **`memberId`:** numeric id sent by the app; **must match the logged-in session**. Easiest source: intercept the first real `client_vars` POST after navigation (same as above), or locate it in another space API response if documented.
- **`schemaVersion` / `clientVersion`:** follow the browser; bump if the API starts returning errors.

**Response envelope** (`200`, `code: 0`): `{ "code": 0, "msg": "", "data": { ... } }`.

**Programmatic `fetch` from the page:** `credentials: 'include'` + **`X-CSRFTOKEN`** + body above → **200** JSON (verified in MCP). Bare `page.request.post` from Node needs the same cookies, Referer, and CSRF.

### Response format (`data` and `snapshot`)

**Top-level `data`** (typical keys):

| Field | Role |
|--------|------|
| `token` | Spreadsheet token (same family as request `token` / wiki `obj_token`). |
| `sheetId` | Short id for the **active** sheet tab (e.g. `qKEyH5`), not the long spreadsheet token. |
| `revision` | Integer snapshot revision (collab / OT). |
| `schemaVersion` | Protocol version (e.g. `9`). |
| `serverTimestamp` | Server ms timestamp. |
| `permissions` | Array of permission flags (view/edit bits). |
| `status`, `permStatusCode`, `authorized`, `isHistorySnapshot`, `showTemplate`, `linkISV`, `changesets` | Session / feature gating. |
| `snapshot` | Bulk of model state — see below. |

**`data.snapshot`** contains:

| Key | Format | Contents |
|-----|--------|----------|
| `gzipTopSnapshot` | base64 → **gzip** → **protobuf** | Workbook / tab strip: locales (`zh-CN`), tab order, names, row/column defaults. Wire format starts with `0a…` (length-delimited messages). |
| `gzipResource` | base64 → **gzip** → **protobuf** | Per-sheet resources: column widths, row heights, styles, merged regions metadata — still binary protobuf. |
| `gzipBlockMeta` | base64 → **gzip** → **UTF-8 JSON** | **Easy to parse.** Maps **sheet id** → `{ cellBlockMetas, formulaBlockMeta }`. |
| `gzipDependency` | base64 → **gzip** → **UTF-8 JSON** | Small object, e.g. `{ "size": 500, "ver": 0.1, "dependency": {}, "errFml": {} }`. |
| `blocks` | `{ [blockId]: base64 gzip blob }` | **Cell store:** one or more blocks; each value is base64 → **gzip** → **protobuf** (~tens of KB for a full sheet range). |

**`gzipBlockMeta` JSON shape** (after gunzip + `JSON.parse`), illustrated from 5.3 寄存器表:

- Top-level keys are **per-tab sheet ids** (e.g. `qKEyH5`, `RaC5dD`, `uTFJgm`).
- Each sheet value has:
  - **`cellBlockMetas`**: array of blocks covering the grid, e.g.  
    `{ "revision": 690, "range": { "rowStart", "rowEnd", "colStart", "colEnd" }, "blockId", "size", "gzipSize" }`  
    — links **`blockId`** to **`snapshot.blocks[blockId]`** and gives the **row/column bounds** for that protobuf blob.
  - **`formulaBlockMeta`**: `{ schemaVersion, revision, hasFormula, hasDirtyFormula, maxFormulaId, blockMetas }` — formula subsystem metadata.

**`snapshot.blocks[blockId]`** after gunzip:

- First bytes look like **protobuf** (e.g. `0a … 08 … 12 …`), not JSON.
- Embedded ASCII snippets include human-readable pieces (sheet id, register ranges like `30003 - 30050`, version strings) mixed with dense binary — this is the **Feishu/Lark sheet operational-transform / cell encoding**, same class of data the web worker (`sheet_app_spa`, `vsh_*.worker.js`) consumes.
- **Export implication:** turning this into TSV requires either **reverse-engineering the protobuf** (no schema in this repo) or **driving the UI** (clipboard / automation). The **metadata JSON** alone is enough to know **how many tabs**, **block ids**, and **cell ranges**, but not the **cell text matrix**.

## Related

- `feishu-wiki-sheet-tsv-manifest.json` — wiki token → `docs/cn/**/*.tsv` paths  
- `feishu-sheet-clipboard-export.mjs` — clipboard TSV batch (fragile; prefer **`sheet/client_vars`** once body is known)
- **`feishu-sheet-protobuf-notes.md`** — reverse notes: client decode path (`Uu` / `Commands.decode`), **`Vu`** schema extraction, **`npm run feishu:sheet-extract-schema`**, and **`feishu-sheet-decode-commands.mjs`**
