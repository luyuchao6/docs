# Feishu → `docs/cn` tooling

Full narrative, API details, MCP gotchas, and DOM fallback: **`.claude/skills/scrape-wiki/SKILL.md`**.

## Two-phase workflow (recommended)

1. **Download raw API dumps** (needs network + Playwright; run when the wiki changed):

   ```bash
   npm install
   npx playwright install chromium   # once per machine
   npm run feishu:pull               # → .playwright-mcp/feishu-api--*.json
   ```

2. **Download wiki images + token map** (same Playwright session as the hub; assigns `2.2-使用说明-img-0` style names and writes `scripts/feishu-image-token-map.json`):

   ```bash
   npm run feishu:sync-images
   ```

   Re-download everything: `npm run feishu:sync-images -- --force`. Manual overrides stay in `scripts/feishu-image-tokens.mjs`.

3. **Offline: dumps → Chinese markdown** (repeat while editing `feishu-client-vars-to-markdown.mjs`):

   ```bash
   npm run feishu:dump_to_markdown
   ```

   Raw JSON is **kept** under `.playwright-mcp/` by default so you can re-run step 3 without a new scrape. To remove each JSON after a successful convert: `npm run feishu:dump_to_markdown -- --delete-dumps`.

**One command for all phases:** `npm run feishu:scrape` (`feishu:pull` → `feishu:sync-images` → `feishu:dump_to_markdown`).

**Image basenames in new pages:** `feishu-image-token-map.json` is produced by **`feishu:sync-images`**. If you run **`feishu:dump_to_markdown`** before that file lists the new page’s tokens, image links become `feishu-{token}.png` while PNGs on disk use `{slug}-img-N.png`. Either run sync before dump, or fix links with **`fix-feishu-image-links-in-md.mjs`** (no re-scrape needed).

## Main files

| Script | Purpose |
|--------|---------|
| `feishu-wiki-cn-manifest.json` | Wiki tokens → output paths under `docs/cn/`. **04-SDK** hub pages (`4.1` / `4.2` / `4.3`) each have subpages (`4.1.1`–`4.1.6`, `4.2.1`–`4.2.4`, `4.3.1`–`4.3.4`) listed as separate rows; extend **`TOKEN_MAP`** in `feishu-client-vars-to-markdown.mjs` when adding wiki links. |
| `feishu-pull-wiki-playwright.mjs` | Phase 1: headless Playwright; writes API dumps only |
| `feishu-pull-one-wiki-page.mjs` | **Single wiki token** → one `feishu-api--{token}.json` (no other pages). Use when one page failed or you need to refresh one dump. **`npm run feishu:pull-one -- <wiki_token>`**. If you see **NodePermFail**, use **`FEISHU_PLAYWRIGHT_USER_DATA`** + **`--headed`** once to sign in (see script header). |
| `feishu-convert-one-dump-to-cn.mjs` | **One dump** → one `docs/cn/…` file from manifest (no bulk). **`npm run feishu:convert-one-cn -- <wiki_token>`** after a successful `feishu:pull-one`. |
| `write-feishu-api-dump-from-stdin.mjs` | Pipe raw JSON into `.playwright-mcp/feishu-api--{token}.json` (e.g. after copying MCP `browser_run_code` payload). **`node scripts/write-feishu-api-dump-from-stdin.mjs <token> < dump.json`** |
| **`feishu-mcp-one-page-wiki.md`** | **Playwright MCP:** log in to Feishu in the MCP browser, then run the **`browser_run_code`** snippet to write **one** `feishu-api--{token}.json` (no full `feishu:pull`). Use when headless pull returns `Login Required` / `NodePermFail`. |
| `feishu-sync-images.mjs` | Phase 1b: download images by token → `docs/cn/assets/images/`; writes `feishu-image-token-map.json` |
| `feishu-image-tokens.mjs` | Manual image token → basename overrides (optional) |
| `apply-feishu-api-dumps.mjs` | Phase 2: dumps → `docs/cn/` (`npm run feishu:dump_to_markdown`); `--delete-dumps` to remove JSON after |
| `feishu-client-vars-to-markdown.mjs` | One dump → one `.md`; maintain `TOKEN_MAP`; images resolve via manual map + `feishu-image-token-map.json` |
| `fix-feishu-image-links-in-md.mjs` | If `.md` still has `feishu-{token}.png` after **`feishu:sync-images`** (e.g. markdown was converted before the map existed), run **`node scripts/fix-feishu-image-links-in-md.mjs --sdk41`** or pass specific `.md` paths to rewrite links to `{page}-img-N.png`. |
| `feishu-sheet-clipboard-export.mjs` | **Standalone wiki spreadsheet pages:** clipboard TSV (`npm run feishu:sheet-clipboard -- <token> --out file.tsv`). **`npm run feishu:scrape-sheets-tsv`** writes all rows in `feishu-wiki-sheet-tsv-manifest.json` → `docs/cn/**/*.tsv`. Needs logged-in session; use `--headed` if empty. |
| `feishu-wiki-sheet-tsv-manifest.json` | Wiki tokens → `docs/cn/…/*.tsv` paths for `feishu:scrape-sheets-tsv` |
| `feishu-sheet-explore.mjs` | **Headed** browser on a sheet wiki page; logs frames/iframes; keep open until Enter (`npm run feishu:sheet-explore`). Use `--pause` for `page.pause()` / inspector. |
| **`feishu-mcp-sheet-explore.md`** | **Interactive sheet exploration with Playwright MCP** (navigate, snapshot, `browser_run_code`, network). Prefer this over the CLI explorer; then port findings to a headless `feishu-sheet-*.mjs`. |
| **`feishu-sheet-protobuf-notes.md`** | **Sheet snapshot protobuf:** how the web client decodes `client_vars` gzip blocks (`Commands` message). **`npm run feishu:sheet-extract-schema`** → `scripts/generated/feishu-sheet-commands-vu.json` (gitignored). **`feishu-sheet-decode-commands.mjs`** decodes a base64 gzip block to JSON (cell text still uses value-pool indirection; see notes). |
| **`feishu-sheet-capture-client-vars.mjs`** | **`npm run feishu:sheet-capture-client-vars -- <wiki_token>`** — headless Playwright opens the wiki page, waits for `POST …/sheet/client_vars`, saves **`.playwright-mcp/sheet-client-vars--{token}.json`** (needs a logged-in Chromium profile; use `--headed` to sign in once). |
| **`feishu-sheet-export-xlsx.mjs`** | **`npm run feishu:sheet-export-xlsx`** — for each row in **`feishu-wiki-sheet-tsv-manifest.json`**, downloads spreadsheet data (all tabs via extra `client_vars` calls), decodes protobuf blocks to grids, writes **`docs/cn/…/*.xlsx`** next to the `.tsv` paths. **`--wiki <token>`** for one page; **`FEISHU_PLAYWRIGHT_USER_DATA`** or **`--headed`** if login required. Rich-text cells may show as `[RichText#…]`. |

## MCP helpers (optional)

Regenerate after editing the manifest:

- `build-feishu-fetch-mcp-chunks.mjs` → `.feishu-mcp-chunks/chunk-*.json`
- `generate-feishu-mcp-per-page.mjs` → `.feishu-mcp-per-page/{token}.json`
- `build-feishu-mcp-run-all.mjs` / `build-feishu-mcp-run-parts.mjs` → `.feishu-mcp-run-all.json` / `.feishu-mcp-run-part*.json`

## English docs

`docs/en/` is **not** scraped from Feishu; translate from CN manually.
