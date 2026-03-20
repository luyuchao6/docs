---
name: scrape-wiki
description: Scrape Feishu wiki pages to local markdown files with images. Use when updating or re-scraping the HT motor documentation from the Feishu wiki.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__playwright__browser_navigate, mcp__playwright__browser_network_requests, mcp__playwright__browser_evaluate, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_snapshot, mcp__playwright__browser_click, mcp__playwright__browser_run_code, cursor-ide-browser (browser_navigate, browser_snapshot, browser_click, browser_type, browser_lock/unlock)
argument-hint: [page-token or "all"]
---

# Feishu Wiki Scraper

Scrape pages from the HT Motor documentation wiki at `https://lingdongfangcheng.feishu.cn/wiki/` to local markdown files.

**Quick commands:** `npm run feishu:pull` → `npm run feishu:dump_to_markdown` (or `npm run feishu:scrape` for both) — see **End-to-end: two-phase CN wiki workflow** below and **`scripts/README.md`**.

**MCP servers in this repo:** Playwright tools use server id **`project-0-ht-dev-docs-playwright`** (see `call_mcp_tool`). The Cursor **Simple Browser** uses **`cursor-ide-browser`**. Either can drive the scrape once the wiki is actually loaded.

**Feishu spreadsheet pages (standalone sheet wikis, not Docx):** use Playwright MCP for **interactive** exploration (`browser_navigate` → snapshot / `browser_run_code` / `browser_network_requests`), then implement headless export in `scripts/feishu-sheet-*.mjs`. See **`scripts/feishu-mcp-sheet-explore.md`** for the playbook and example snippets.

## Extraction strategy: API first (recommended)

For **Docx wiki pages** (normal articles — not embedded Sheets), the web app loads content from an **undocumented but stable JSON API**. Prefer this over **DOM scroll + `[data-block-id]`** extraction: you get the full **`block_map`** in a few requests, **no virtualization**, and **complete code blocks** without scroll artifacts.

**Requirements**

1. **Same browser session as a logged-in or public-access wiki** — use Playwright MCP after opening the wiki (hub → target page is ideal so cookies and tenant context match what the UI uses).
2. **`page.request.get(...)`** (Playwright) forwards the page cookies to `lingdongfangcheng.feishu.cn` — this is how to call the API “as the browser”.

**Discovery → `obj_token` (doc page id)**

```http
GET /space/api/wiki/v2/tree/get_node/?wiki_token={wiki_token}&space_id={space_id}&expand_shortcut=true&with_deleted=true
```

Response `data` includes **`obj_token`** (doc id, e.g. `Q08Jd9of…`) and **`space_id`**. The **`wiki_token`** is the token in the public URL (`/wiki/SoKwwi…`). For the motor library, **`space_id`** has been observed as **`7539498339620913154`**; still **read it from `get_node` or `get_info`** when automating.

**Document chunks (`client_vars`)**

```http
GET /space/api/docx/pages/client_vars?id={obj_token}&mode=7&limit=300&wiki_space_id={space_id}&container_type=wiki2.0&container_id={wiki_token}
```

- First request: **omit** `cursor`.  
- While `data.has_more` is true: repeat with **`cursor=data.cursor`** (URL-encoded).  
- Merge all responses’ **`data.block_map`** into one object (later chunks add keys).  
- Metadata: **`data.meta_map[obj_token]`** — `title`, `update_time`, etc.

**Convert to markdown**

Repo script (takes merged JSON: `{ pageId, wikiToken, spaceId, meta, blockMap }`):

```bash
node scripts/feishu-client-vars-to-markdown.mjs /path/to/dump.json docs/cn/01-电机/1.2-fdcan协议解析.md
```

### Repo scripts (`scripts/`)

**Core — keep in version control**

| File | Role |
|------|------|
| `feishu-wiki-cn-manifest.json` | Ordered `[wiki_token, path]` rows; paths are relative to `docs/cn/`. Same token order as the **Page Index** table below. Change this when wiki tokens or output paths change. |
| `feishu-client-vars-to-markdown.mjs` | Converts one merged dump `{ pageId, wikiToken, spaceId, meta, blockMap }` to markdown. **`TOKEN_MAP`** in this file rewrites `mention_doc` / wiki URLs to relative `docs/cn/` links — extend when new cross-links appear. |
| `apply-feishu-api-dumps.mjs` | **Offline:** reads `.playwright-mcp/feishu-api--{wikiToken}.json`, runs the converter (or writes CN stubs), updates `docs/cn/`. **Keeps JSON by default** so you can iterate on **`feishu-client-vars-to-markdown.mjs`** without re-scraping. **Optional `--delete-dumps`** removes each file after success. npm: **`feishu:dump_to_markdown`**. |
| `feishu-pull-wiki-playwright.mjs` | **Phase 1 — download dumps only** (headless, no MCP): **`npm install`** + **`npx playwright install chromium`**. Opens the hub, **`fetch` + `get_node` / `client_vars`**, writes **`feishu-api--*.json`** into **`.playwright-mcp/`**. Does **not** run the markdown converter. |

**Playwright MCP payload generators — regenerate after manifest edits**

These emit JSON suitable for **`browser_run_code`** `arguments`: `{ "code": "async (page) => { ... }" }`.

| Script | Command | Writes |
|--------|---------|--------|
| `build-feishu-fetch-mcp-chunks.mjs` | `node scripts/build-feishu-fetch-mcp-chunks.mjs` | `scripts/.feishu-mcp-chunks/chunk-00.json`, … (**5 wiki pages per chunk**) |
| `generate-feishu-mcp-per-page.mjs` | `node scripts/generate-feishu-mcp-per-page.mjs` | `scripts/.feishu-mcp-per-page/{wikiToken}.json` (**one page per file**, smaller payloads) |

Use **chunks** when you want fewer MCP calls; use **per-page** when chunk payloads hit size limits. Run fetches **one at a time** for heavy code (see gotchas below). The `.feishu-mcp-*` directories are build artifacts — delete anytime and re-run the generators; they are **gitignored**.

**Typical API path (choose one):**

1. **Headless (recommended):** **Phase 1** `node scripts/feishu-pull-wiki-playwright.mjs` → **Phase 2** `node scripts/apply-feishu-api-dumps.mjs` (repeat phase 2 while tuning the converter).
2. **Cursor Playwright MCP:** hub URL → chunk or per-page `browser_run_code` with **`page.request.get`** *or* in-page **`fetch` + Blob download** so JSON lands in **`.playwright-mcp/`** → `apply-feishu-api-dumps.mjs`.

**MCP-only one-shot payloads (optional):** `node scripts/build-feishu-mcp-run-all.mjs` writes **`scripts/.feishu-mcp-run-all.json`** (single `browser_run_code` body with embedded manifest + in-browser `fetch`). If that hits MCP size limits, use **`build-feishu-mcp-run-parts.mjs`** → `.feishu-mcp-run-part0.json` … `part2.json` (three sequential MCP calls).

**English (`docs/en/`)** — No English Feishu wiki; **`docs/en/` is manual translation** from CN. Do not add EN scrape targets or manifests.

The agent can build `dump.json` inside **`browser_run_code`**: fetch `get_node` + paginate `client_vars`, `JSON.stringify({ pageId, wikiToken, spaceId, meta, blockMap })`, then trigger a **Blob download** (same pattern as other scrapes) or write via a small Node step if the environment allows.

**Playwright MCP gotchas**

- **`page.evaluate(fn, arg)`** accepts only **one** serializable argument after `fn`. Use e.g. `(p) => { … p.json … p.token … }` with `{ json: payload, token: wikiToken }`, not `(json, token) => …, json, token` (that throws “Too many arguments”).
- The MCP JS context has **no `setTimeout`** — use **`page.waitForTimeout(ms)`** for delays between downloads.
- **Do not run two large `browser_run_code` calls in parallel** on the same page; a navigation from one run can destroy the other’s execution context.

**Caveats**

- **Not a public OpenAPI** — shape and params may change; `mode=7` is what the current web client uses.  
- **Attributed text** — `initialAttributedTexts` + `apool` hold bold, links, **`mention_doc`** (wiki links). The script maps known wiki tokens to relative paths; extend **`TOKEN_MAP`** in `scripts/feishu-client-vars-to-markdown.mjs` as needed.  
- **Outline numbering** — heading text in the API may **omit** leading indices like `1.` / `3.1` if Feishu stores them as outline metadata only; titles may differ slightly from the sidebar.  
- **Lists** — Feishu encodes nesting via **`ordered` / `bullet` `children`** (including nested `ordered`). The converter indents with **4 spaces per level**, restarts **`1.` numbering** for each sibling group of ordered items, and joins adjacent list lines with a **single newline** so CommonMark does not split one list into many.  
- **Sheets / special embeds** — still treat embedded spreadsheets like **5.3** / **06-附件** as stubs (DOM/API may not give a useful table export).
- **Images** — `feishu-client-vars-to-markdown.mjs` emits `![alt](…/assets/images/….png)` using each block’s **`token`**. Run **`npm run feishu:sync-images`** after **`feishu:pull`**: it downloads bytes from Feishu’s cover stream URL (`/space/api/box/stream/download/v2/cover/{token}`), writes **`scripts/feishu-image-token-map.json`** (`{cnMdBasename}-img-0`, …), and saves PNGs under **`docs/cn/assets/images/`**. Optional **manual** overrides live in **`scripts/feishu-image-tokens.mjs`**. If you skip sync, unmapped tokens fall back to `feishu-{token}.png` and links look broken until files exist. The **DOM scroll** path still downloads pixels via the browser and avoids token plumbing.

**Fallback:** If `client_vars` returns **non-zero `code`** or **401**, use **human-assisted navigation** and the **DOM scroll method** below.

---

## End-to-end: two-phase CN wiki workflow

Workflow is split so you **download raw API dumps once**, then **iterate offline** on **`feishu-client-vars-to-markdown.mjs`** and re-run conversion without touching Feishu.

| Phase | What | Command |
|-------|------|---------|
| **1** | Download JSON only → **`.playwright-mcp/feishu-api--{wikiToken}.json`** | `npm run feishu:pull` |
| **2** | Offline: dumps → **`docs/cn/**`** (dumps **kept** by default) | `npm run feishu:dump_to_markdown` |
| Optional | One-shot: pull then convert | `npm run feishu:scrape` |
| Optional | Delete each JSON after a successful convert (save disk) | `npm run feishu:dump_to_markdown -- --delete-dumps` |

### Prerequisites (once per machine / clone)

```bash
cd /path/to/ht-dev-docs
npm install
npx playwright install chromium
```

Playwright is a **devDependency**; Chromium is downloaded to the Playwright cache (not committed).

### Without npm scripts

```bash
node scripts/feishu-pull-wiki-playwright.mjs    # phase 1
node scripts/apply-feishu-api-dumps.mjs         # phase 2 (repeat; add --delete-dumps to remove JSON after)
```

### How the headless pull works

1. Launches **headless Chromium**, navigates to the **hub** URL (same as **Wiki entry URL** below).
2. For each `[wiki_token, relativePath]` in **`feishu-wiki-cn-manifest.json`**, runs **`page.evaluate`** in the wiki origin so **`fetch(..., { credentials: 'include' })`** carries the same anonymous/public session cookies as the open tab.
3. Calls **`get_node`** then paginated **`client_vars`** (same endpoints as **Extraction strategy** above).
4. Writes one JSON file per wiki token. **Docx** nodes (`obj_type === 22`) get full `{ pageId, wikiToken, spaceId, meta, blockMap }`. **Files** (e.g. PDF), **sheets**, and other non-docx nodes get **`{ stub: true, … }`** — **`apply-feishu-api-dumps.mjs`** turns those into short CN stub markdown.

Unauthenticated **`curl`** to the same APIs usually returns **Login Required**; the browser session is required.

### Images after API export

- The converter emits **`![…](assets/images/{basename}.png)`** (path relative to each **`docs/cn/…`** file).
- **`client_vars`** image blocks expose a **file/cover `token`** (used in Feishu stream URLs). That is **not** the same as `mount_node_token` in manual **`curl`** recipes. Stable filenames for the reading guide are listed in **`IMAGE_TOKEN_TO_BASENAME`** inside **`feishu-client-vars-to-markdown.mjs`** (cover tokens + legacy mount-node ids).
- PNG bytes are **not** in the JSON dump. Either copy existing assets (e.g. from **`docs/en/assets/images/`**), or download via authenticated **`curl`** / DOM scrape, then place files under **`docs/cn/assets/images/`** matching the markdown basenames.

### MCP vs headless

| Approach | When to use |
|----------|-------------|
| **`feishu-pull-wiki-playwright.mjs`** | Default for “re-scrape everything”; no MCP payload limits; reproducible in CI (if wiki stays public). |
| **Chunk / per-page JSON** (`build-feishu-fetch-mcp-chunks.mjs`, `generate-feishu-mcp-per-page.mjs`) | Interactive Cursor session; **`browser_run_code`** with **`page.request.get`** or in-page **`fetch` + Blob** downloads. |
| **`build-feishu-mcp-run-all.mjs` / `build-feishu-mcp-run-parts.mjs`** | Pre-built **`browser_run_code`** bodies (in-browser `fetch`, embedded manifest). Use if you prefer fewer hand-written snippets; parts split the payload if one JSON file is too large for MCP. |

### Git / artifacts

- **`.playwright-mcp/`** and **`node_modules/`** are **gitignored**.
- Generated MCP argument folders under **`scripts/.feishu-mcp-*`** are gitignored; regenerate with the **`build-*` / `generate-*`** scripts when the manifest changes.

---

## Wiki entry URL (mandatory first hop)

**Always load the wiki through this URL first** (reading guide / doc home). **Do not** `browser_navigate` directly to arbitrary `https://lingdongfangcheng.feishu.cn/wiki/{token}` pages — that **forces Feishu login** for most tokens.

```
https://lingdongfangcheng.feishu.cn/wiki/KOa3wfI8Aiv3xxkmWsrchBPBn5d
```

**After** this page loads, open the target article **only by clicking** in-wiki links (sidebar, TOC, body links) until the URL shows the desired **`{token}`** and the article body is visible.

**Automation tip:** e.g. `page.locator('a[href*="' + token + '"]').first().click()` or match link text from the **Page Index** / local markdown title — confirm with **snapshot** after the click.

**Human-assisted:** paste the **entry URL** above in the address bar (not the deep page URL), then **click through** to the target doc; reply **`continue`** when the **correct article** is open.

## Authentication, captcha, and navigation (CRITICAL)

**Do not assume any single `browser_navigate` lands on the article.** Feishu often **redirects to `accounts.feishu.cn/.../login`** if you skip the **entry URL** or deep-link the wrong way. Raw `curl` / unauthenticated fetches may get **404** or the login page — there is **no** stable “fully public” HTML API for arbitrary wiki bodies.

### Human-assisted navigation (preferred when login / captcha appears)

After the **Playwright MCP** browser has started and you have navigated to the wiki (or the redirect target), if **`browser_snapshot`** shows **Feishu login**, **captcha**, or other **bot-sensitive** interstitials:

1. **Stop trying to automate past it** (do not rely on scripted navigation alone for that step).
2. **Ask the human** to use the **same** Playwright-controlled browser window and **manually**:
   - Paste the **wiki entry URL** into the **address bar** (see **Wiki entry URL** above — **not** a deep `wiki/{token}` for inner pages).
   - **Click through** in the wiki UI until the **target article** is open (sidebar / links in the reading guide).
   - If **login** or **captcha** still appears, complete those **by hand** in that window. Human interaction avoids many **bot detection** paths.
3. Tell the human to reply with **`continue`** (literally that word) **after** the **correct target article** is visible and stable (check URL contains the right **`{token}`** from the Page Index).
4. **Only then** take a fresh **`browser_snapshot`**, confirm the document (e.g. **`.bear-web-x-container`**), and proceed with **scroll + extract**.

The agent must **wait** for **`continue`** — do not assume the page is ready without verification.

### Automated navigation (when login is not blocking)

1. **Read the page after every navigation**  
   Use **`browser_snapshot`** (or Playwright snapshot) and **interpret** the result. If the title or URL indicates **login**, **captcha**, or **Feishu accounts**, you are **not** on the wiki yet — use **Human-assisted navigation** above unless the human has already confirmed the session.

2. **Optional: clicks and typing in the MCP browser**  
   When automation is acceptable, complete steps with **`browser_click`**, **`browser_type`**, **`browser_fill`**, etc., on the **same** session. Repeat **snapshot → act** until the **wiki article** is visible.

3. **External login does not carry over**  
   Logging in or passing a captcha in **Chrome, Firefox, or another profile** does **not** authenticate **Playwright MCP** or **Cursor IDE Browser** — those use **isolated** storage. Manual steps must happen **in the MCP browser** (address bar + human), or use **`storageState`** (see below).

4. **Only then run extraction**  
   After the real wiki page is shown, proceed with scroll + **`browser_evaluate`** / **`browser_run_code`** as in **Extraction Method**. If `.bear-web-x-container` is missing, **do not** treat empty extract as “no content” — you are probably still on login or an error interstitial.

5. **Optional: persisted auth (advanced)**  
   For repeatable headless runs, save Playwright **`storageState`** once after manual login (`page.context.storageState({ path: '…' })`) and load it in automation. Document the path in the team; never commit secrets.

## Page Index

| Token | Chinese Path | English Path |
|-------|-------------|--------------|
| KOa3wfI8Aiv3xxkmWsrchBPBn5d | 00-阅读指南.md | 00-reading-guide.md |
| TJ9owjVTXim1blktOwocqFBLnje | 01-电机/1.1-产品手册.md | 01-motor/1.1-product-manual.md |
| SoKwwiFeciXyA3kLGEXcQRIcnhf | 01-电机/1.2-fdcan协议解析.md | 01-motor/1.2-fdcan-protocol.md |
| LOLewCeVpiV1VEkQSl3cIE1xnkj | 01-电机/1.3-CAN协议解析.md | 01-motor/1.3-CAN-protocol.md |
| GLZ3wL1ndikhjek9XNQcleLPnzc | 01-电机/1.4-电机接口说明.md | 01-motor/1.4-motor-interface.md |
| G6ruwPf2Vic7whkv5H5clk9lndb | 01-电机/1.5-常见问题.md | 01-motor/1.5-faq.md |
| SyDOwA1K7iZXHZknxc5cXLW1nSe | 02-高擎电机调试助手/2.1-快速上手.md | 02-motor-debugging-assistant/2.1-quick-start.md |
| DaYgwmsOHiZJdWkLBUZcA2rOn5P | 02-高擎电机调试助手/2.2-使用说明.md | 02-motor-debugging-assistant/2.2-user-guide.md |
| SR2YwioxOiJk4HkT0VCcFTn7nbg | 02-高擎电机调试助手/2.3-使用问题.md | 02-motor-debugging-assistant/2.3-troubleshooting.md |
| Vz5jwV38oijAqIkAwobc8ik3nWd | 03-电机使用例程/3.1-快速上手.md | 03-motor-example-code/3.1-quick-start.md |
| YDxIw8GTxifZX4kGjt0c8rDdnX3 | 03-电机使用例程/3.2-FDCAN例程详细说明.md | 03-motor-example-code/3.2-FDCAN-example-details.md |
| Pn3RwxQuFixlnPkAO86cyDxKnVh | 03-电机使用例程/3.3-CAN例程详细说明.md | 03-motor-example-code/3.3-CAN-example-details.md |
| PrNLwtxXii0Fd2kFnskcXtewnQc | 03-电机使用例程/3.4-H730开发板接口说明.md | 03-motor-example-code/3.4-H730-dev-board-interface.md |
| U2UlwmQx9ihBbPkziPxcg60cn6e | 03-电机使用例程/3.5-常见问题.md | 03-motor-example-code/3.5-faq.md |
| VU7GwJDz7ifYDCkffY4cxc7lnrl | 04-SDK/4.1-SDK快速上手.md | 04-SDK/4.1-SDK-quick-start.md |
| B8vTwbNoaiYAFqkHMUOcRDUCnYf | 04-SDK/4.2-软件说明.md | 04-SDK/4.2-software-guide.md |
| PJccwpmg3iwBoQkNQuxccxbnnPR | 04-SDK/4.3-硬件说明.md | 04-SDK/4.3-hardware-guide.md |
| UMOGw2k8NiRe98kc1Gzcj4S7nuf | 05-RS485转FDCAN/5.1-硬件说明.md | 05-RS485-to-FDCAN/5.1-hardware-guide.md |
| XydWwAvfoicEmRkhl2GcT6f7nJb | 05-RS485转FDCAN/5.2-使用说明.md | 05-RS485-to-FDCAN/5.2-user-guide.md |
| JYUcwEPNCiRAaSkM8kic27JAnDb | 05-RS485转FDCAN/5.3-寄存器表.md | 05-RS485-to-FDCAN/5.3-register-table.md |
| Uet7wLpASiOEdpkCjeFcfL0rnDf | 06-附件/表1-电机寄存器功能表.md | 06-appendix/table1-motor-register-functions.md |
| IRkswFiL0iS9XDkXICJcqAOQnfe | 06-附件/表2-电机运行模式.md | 06-appendix/table2-motor-operating-modes.md |
| LVw2wuvDmikpmokyYCicyWwBnYc | 06-附件/表3-电机报错代码说明.md | 06-appendix/table3-motor-error-codes.md |
| JhUQwgty4inhKnkSNtXchUjZnfd | 06-附件/表4-电机一拖多模式ID功能说明.md | 06-appendix/table4-motor-multi-control-mode-ID.md |
| W2g9w0bKUiXeePkjH4mcXxHdnqf | 06-附件/表5-常用类型说明.md | 06-appendix/table5-common-types.md |

## Extraction Method (DOM fallback)

### Overview

If the **client_vars API** (above) is unavailable, use the DOM: Feishu wiki pages use a **virtualized DOM** — content is lazily rendered as you scroll. You MUST scroll through the entire page to capture all blocks. The proven approach is a single `browser_evaluate` / `browser_run_code` pass that scrolls, extracts `[data-block-id]` blocks, and downloads images.

### Step-by-step for each page

**Step 0: Enter via hub, then open the target page**

1. `browser_navigate` → **`https://lingdongfangcheng.feishu.cn/wiki/KOa3wfI8Aiv3xxkmWsrchBPBn5d`** (see **Wiki entry URL**).  
2. **Snapshot**. If **login / captcha**, use **Human-assisted navigation** (hub URL in address bar + human click-through + **`continue`**).  
3. **Click** to the target page (automated `a[href*="…token…"]` or human) until the article for **`{token}`** is shown. **Snapshot** again and confirm you are **not** on **`accounts.feishu.cn`**.

**Step 1: Confirm you are on the correct article**

The address bar should show `…/wiki/{token}` for the **target** page (not only the hub token). **Snapshot** and verify the wiki document. Check for:

1. **Last updated date**: The page toolbar shows `"Last updated: <date>"` (e.g. "Last updated: Jan 09"). Extract this text from the snapshot. You'll need it for the YAML frontmatter.

2. **Spreadsheet detection**: If the snapshot shows a spreadsheet UI (tabs, cell references, Menu/Wrap/Filter controls), this is an embedded Feishu Sheet. **Do NOT attempt to scrape spreadsheets.** Instead, write a stub markdown noting it's a spreadsheet with the source link, and tell the user to download it manually. Still include the YAML frontmatter with `last_updated`.

### Change detection (skip if unchanged)

Before scraping a page, read the existing local markdown file and check its `last_updated` frontmatter value. Compare it to the "Last updated" shown on the live Feishu page. If they match, **skip the page** — it hasn't changed. Report it as "unchanged" and move on. This saves significant effort on re-scrapes.

**Step 2: Extract content + download images**

Use a single `browser_evaluate` call with this pattern:

```javascript
async () => {
  // Find the scrollable container
  const container = document.querySelector('.bear-web-x-container');
  if (!container) return { markdown: '', images: [] };

  let scroller = container;
  while (scroller && scroller !== document.documentElement) {
    if (scroller.scrollHeight > scroller.clientHeight + 50) break;
    scroller = scroller.parentElement;
  }

  const totalHeight = scroller.scrollHeight;
  const step = 500;
  const seenBlockIds = new Set();
  const blocks = [];
  const images = [];
  let imgIndex = 0;

  // IMAGE_PREFIX should be like "3.2" for section 3.2
  const IMAGE_PREFIX = 'X.X';

  for (let pos = 0; pos <= totalHeight; pos += step) {
    scroller.scrollTop = pos;
    await new Promise(r => setTimeout(r, 300));

    // Capture blocks
    const els = container.querySelectorAll('[data-block-id]');
    for (const el of els) {
      const bid = el.getAttribute('data-block-id');
      if (seenBlockIds.has(bid)) continue;
      seenBlockIds.add(bid);

      const btype = el.getAttribute('data-block-type');
      const text = el.innerText.trim();

      if (btype === 'image') {
        const img = el.querySelector('img');
        if (img && img.src && !img.src.startsWith('data:')) {
          const idx = imgIndex++;
          blocks.push({ type: 'image', text: '', imgIdx: idx });
          images.push({ src: img.src, alt: img.alt || '' });

          // Download via blob trick
          try {
            const resp = await fetch(img.src);
            const blob = await resp.blob();
            const buf = await blob.arrayBuffer();
            const dlBlob = new Blob([new Uint8Array(buf)], { type: 'image/png' });
            const url = URL.createObjectURL(dlBlob);
            const a = document.createElement('a');
            a.href = url;
            // Use dash format for download, will be renamed later
            a.download = IMAGE_PREFIX.replace('.', '-') + '-img-' + idx + '.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch(e) {}
        }
        continue;
      }

      blocks.push({ type: btype || 'text', text });
    }
  }

  return { blocks, images, totalBlocks: blocks.length, totalImages: images.length };
}
```

**Important caveats:**
- Code blocks (`data-block-type="code"`) lose their `.code-line` content when scrolled out of view due to virtualization. The block text may be empty. Screenshots contain the code as a fallback.
- Parent blocks in Feishu can contain child block text, causing duplication. You must deduplicate when converting to markdown.
- Heading levels in the extracted blocks are one level too high (the page title is h1). Bump all headings down by one level.

**Step 3: Copy images from `.playwright-mcp/` to assets**

Images auto-download to `.playwright-mcp/` via the blob URL trick. Copy and rename them:

```bash
for f in .playwright-mcp/X-X-img-*.png; do
  name=$(basename "$f" | sed 's/X-X-img-/X.X-img-/')
  cp "$f" "docs/cn/assets/images/$name"
done
```

Also copy to `docs/en/assets/images/` if the English tree exists.

**Step 4: Convert blocks to markdown**

Every markdown file MUST start with a YAML frontmatter block containing `url` and `last_updated`:

```yaml
---
url: https://lingdongfangcheng.feishu.cn/wiki/{token}
last_updated: "Jan 09"
---
```

- `url` — the full Feishu wiki URL of the original page
- `last_updated` — the exact string from the Feishu page toolbar (e.g. `"Jan 09"`, `"Dec 10"`, `"Mar 15"`). Keep it as-is — do not reformat or parse the date. This is compared verbatim during change detection.

Then convert the extracted blocks into markdown. Apply these transformations:
- Rewrite internal Feishu wiki links to relative markdown links using the Page Index table above
- Bump heading levels (h1→h2, h2→h3, etc.) since the page title is the real h1
- Handle list nesting, code blocks, tables
- Reference images as `../assets/images/X.X-img-N.png`

**Step 5: Save**

Use the Write tool to save the markdown file to the appropriate path under `docs/cn/`.

### LINK_MAP for internal link rewriting

When converting, rewrite links matching `https://lingdongfangcheng.feishu.cn/wiki/{token}` to relative paths. Use the Page Index table above to map tokens to local file paths. Links to tokens NOT in the index should be kept as external URLs.

**Legacy tokens:** `RVuOwhFIRi7l8WknDgRclEdMnCb` (old reading-guide link) should map to the same paths as **`00-阅读指南.md` / `00-reading-guide.md`** — the live **entry** URL uses **`KOa3wfI8Aiv3xxkmWsrchBPBn5d`**. **`Vqrew90Lzifqb0kNUxdcLYo4nVg`** was an incorrect index entry for 1.2 FDCAN; treat **`SoKwwiFeciXyA3kLGEXcQRIcnhf`** as canonical for **`1.2-fdcan协议解析.md` / `1.2-fdcan-protocol.md`** and rewrite old links to the same local paths.

### Cleanup

After scraping, delete the `.playwright-mcp/` directory to remove temporary download files.

## Usage Examples

- `/scrape-wiki all` — Re-scrape all 25 pages
- `/scrape-wiki SoKwwiFeciXyA3kLGEXcQRIcnhf` — Re-scrape page 1.2 (open **hub** `KOa3…` first, then click **1.2 fdcan协议解析**; live token is `SoKwwi…`, not legacy `Vqrew90…`)
- `/scrape-wiki 01` — Re-scrape all pages in section 01-电机

## Important Notes

1. **Spreadsheets**: Pages 5.3 and all 06-附件 pages are embedded Feishu Sheets. Do NOT attempt to extract them. Create a stub with the link and let the user download manually.
2. **Authentication / entry**: Use the **wiki entry URL** first, then **in-wiki clicks** to each article; **deep `navigate` to inner tokens** usually hits **login**. If blocked, **human-assisted** flow (hub URL + click-through + **`continue`**). Optional: **Playwright `storageState`**.
3. **Image paths**: Both `docs/cn/assets/images/` and `docs/en/assets/images/` share the same image files.
4. **Large pages**: Some pages (1.2, 1.3, 3.2, 3.3, 5.2) are very long (30K+ px scroll height). The scroll-and-capture approach handles these, but extraction may take longer.
5. **Deduplication**: Feishu's nested block structure means parent blocks contain child text. Always deduplicate extracted content before saving.
