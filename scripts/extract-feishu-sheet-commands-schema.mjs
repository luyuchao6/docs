#!/usr/bin/env node
/**
 * Downloads Bear sheet index_merged.js and extracts the protobufjs JSON tree `Vu`
 * (lookup root type "Commands") used by the client to decode gzip snapshot blocks.
 *
 * Output: scripts/generated/feishu-sheet-commands-vu.json
 *
 * Usage: node scripts/extract-feishu-sheet-commands-schema.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL =
  'https://lf-package-sg.feishucdn.com/obj/lark-static-sg/eesz/bear/sheet/module/ee/bear_web/sheet/1.1.3.1501/index_merged.js';

const outDir = path.join(__dirname, 'generated');
const outFile = path.join(outDir, 'feishu-sheet-commands-vu.json');

async function main() {
  const url = process.env.FEISHU_INDEX_MERGED_URL || DEFAULT_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const s = await res.text();
  const braceStart = s.indexOf('Vu={');
  if (braceStart < 0) throw new Error('Could not find Vu={ in bundle (Feishu layout changed?)');
  // `Vu={` → slice from `{` (not past it)
  const openBrace = braceStart + 'Vu='.length;
  const endStr = s.indexOf('};function Zu()', openBrace);
  if (endStr < 0) throw new Error('Could not find };function Zu() after Vu');
  const objSrc = s.slice(openBrace, endStr + 1);
  // eslint-disable-next-line no-new-func
  const Vu = new Function('return ' + objSrc)();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(Vu, null, 0), 'utf8');
  console.log(`Wrote ${outFile} (${fs.statSync(outFile).size} bytes) from ${url}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
