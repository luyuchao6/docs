#!/usr/bin/env node
/**
 * Rewrite ![…](../assets/images/feishu-TOKEN.png) to the basename from
 * feishu-image-tokens.mjs + feishu-image-token-map.json (same resolution as
 * feishu-client-vars-to-markdown.mjs). Use when markdown was generated before
 * sync-images populated the map.
 *
 * Usage:
 *   node scripts/fix-feishu-image-links-in-md.mjs <file.md> [file2.md ...]
 *   node scripts/fix-feishu-image-links-in-md.mjs --sdk41   # six 4.1.x SDK CN pages
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_TOKEN_TO_BASENAME } from './feishu-image-tokens.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const autoPath = path.join(__dirname, 'feishu-image-token-map.json');
let imageTokenMapAuto = {};
if (fs.existsSync(autoPath)) {
  imageTokenMapAuto = JSON.parse(fs.readFileSync(autoPath, 'utf8'));
}

function resolveImageBasename(token) {
  return IMAGE_TOKEN_TO_BASENAME[token] ?? imageTokenMapAuto[token] ?? `feishu-${token}`;
}

const SDK41 = [
  'docs/cn/04-SDK/4.1.1-ROS版本SDK的4路叠板快速上手.md',
  'docs/cn/04-SDK/4.1.2-ROS版本SDK的7路主控盒子快速上手.md',
  'docs/cn/04-SDK/4.1.3-ROS版本SDK的通用盒子功率板快速上手.md',
  'docs/cn/04-SDK/4.1.4-Python版本SDK的4路叠板快速上手.md',
  'docs/cn/04-SDK/4.1.5-Python版本SDK的7路主控盒子快速上手.md',
  'docs/cn/04-SDK/4.1.6-Python版本SDK的通用盒子功率板快速上手.md',
];

const args = process.argv.slice(2);
const files =
  args[0] === '--sdk41'
    ? SDK41.map((p) => path.join(path.dirname(__dirname), p))
    : args.map((p) => path.resolve(p));

if (files.length === 0) {
  console.error('Usage: node scripts/fix-feishu-image-links-in-md.mjs <file.md> […] | --sdk41');
  process.exit(1);
}

const re = /assets\/images\/feishu-([A-Za-z0-9]+)\.png/g;

for (const abs of files) {
  if (!fs.existsSync(abs)) {
    console.warn('skip (missing)', abs);
    continue;
  }
  let s = fs.readFileSync(abs, 'utf8');
  const out = s.replace(re, (match, token) => {
    const base = resolveImageBasename(token);
    return `assets/images/${base}.png`;
  });
  if (out !== s) {
    fs.writeFileSync(abs, out, 'utf8');
    console.log('fixed', path.relative(path.dirname(__dirname), abs));
  } else {
    console.log('unchanged', path.relative(path.dirname(__dirname), abs));
  }
}
