#!/usr/bin/env node
/**
 * Decode a Feishu sheet gzip snapshot block (base64 or raw gzip bytes) to JSON
 * using the extracted protobufjs schema (Commands root message).
 *
 * Prerequisites:
 *   npm install
 *   node scripts/extract-feishu-sheet-commands-schema.mjs
 *
 * Usage:
 *   node scripts/feishu-sheet-decode-commands.mjs <base64.txt
 *   node scripts/feishu-sheet-decode-commands.mjs --stdin < base64.txt
 *
 * Or a full saved Network response (DevTools → sheet/client_vars → Save):
 *   node scripts/feishu-sheet-decode-commands.mjs --from-client-vars-json client_vars.json
 *   node scripts/feishu-sheet-decode-commands.mjs --from-client-vars-json dump.json --block block_…
 *
 * Options:
 *   --stdin                  read base64 from stdin
 *   --raw-gzip               input file is raw gzip bytes (not base64)
 *   --from-client-vars-json  path to JSON with data.snapshot.blocks
 *   --block <id>             block id (default: first key in blocks)
 *   --max-json <n>           max output length (default 500000; 0 = no limit)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import protobuf from 'protobufjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(
  __dirname,
  'generated',
  'feishu-sheet-commands-vu.json'
);

function getArg(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return fallback;
  const v = argv[i + 1];
  if (v.startsWith('--')) return fallback;
  return v;
}

/** Positional file args only (not values after --flag). */
function positionalFiles(argv) {
  const skip = new Set();
  const twoArg = [
    '--from-client-vars-json',
    '--block',
    '--max-json',
  ];
  for (let i = 0; i < argv.length; i++) {
    if (twoArg.includes(argv[i])) {
      skip.add(i);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) skip.add(i + 1);
    }
  }
  return argv.filter((a, i) => !a.startsWith('--') && !skip.has(i));
}

/** Pull base64 gzip block from a saved client_vars response JSON */
function extractBlockB64FromClientVarsJson(text, blockId) {
  const j = JSON.parse(text);
  const blocks =
    j?.data?.snapshot?.blocks ??
    j?.snapshot?.blocks ??
    j?.blocks ??
    null;
  if (!blocks || typeof blocks !== 'object') {
    throw new Error(
      'JSON must contain data.snapshot.blocks (or snapshot.blocks) with block ids'
    );
  }
  const keys = Object.keys(blocks);
  if (keys.length === 0) throw new Error('blocks object is empty');
  const id = blockId || keys[0];
  if (!Object.prototype.hasOwnProperty.call(blocks, id)) {
    throw new Error(
      `Unknown block id "${id}". Available: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '…' : ''}`
    );
  }
  const b64 = blocks[id];
  if (typeof b64 !== 'string') throw new Error(`blocks[${id}] is not a string`);
  return { blockId: id, b64 };
}

function loadCommandsType() {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Missing ${schemaPath}. Run: npm run feishu:sheet-extract-schema`
    );
  }
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const Vu = JSON.parse(raw);
  const root = protobuf.Root.fromJSON(Vu);
  return root.lookupType('Commands');
}

function main() {
  const argv = process.argv.slice(2);
  const rawGzip = argv.includes('--raw-gzip');
  const stdin = argv.includes('--stdin');
  const fromJson = getArg(argv, '--from-client-vars-json', null);
  const blockId = getArg(argv, '--block', null);
  let maxJson = 500000;
  const mi = argv.indexOf('--max-json');
  if (mi >= 0 && argv[mi + 1]) maxJson = parseInt(argv[mi + 1], 10) || 0;

  const files = positionalFiles(argv);

  let b64String = null;

  if (fromJson) {
    if (!fs.existsSync(fromJson)) {
      console.error(`File not found: ${fromJson}`);
      process.exit(1);
    }
    const text = fs.readFileSync(fromJson, 'utf8');
    const { blockId: used, b64 } = extractBlockB64FromClientVarsJson(text, blockId);
    console.error(`Decoding block: ${used}`);
    b64String = b64;
  }

  let input;
  if (b64String != null) {
    input = Buffer.from(b64String, 'utf8');
  } else if (stdin) {
    input = fs.readFileSync(0);
  } else if (files.length >= 1) {
    const p = files[0];
    if (!fs.existsSync(p)) {
      console.error(`File not found: ${p}`);
      console.error(
        'Save a base64-only file, or use: --from-client-vars-json <client_vars-response.json>'
      );
      process.exit(1);
    }
    input = fs.readFileSync(p);
  } else {
    console.error(`Usage:
  node scripts/feishu-sheet-decode-commands.mjs <base64.txt> [--max-json N]
  node scripts/feishu-sheet-decode-commands.mjs --stdin < base64.txt
  node scripts/feishu-sheet-decode-commands.mjs --from-client-vars-json <network-response.json> [--block block_…]

There is no default "block.b64" — create it by pasting the block string from API data.snapshot.blocks,`);
    console.error(
      `or save the full POST response JSON and pass --from-client-vars-json.`
    );
    process.exit(1);
  }

  let gunz;
  if (rawGzip) {
    gunz = input;
  } else {
    const b64 = input.toString('utf8').trim().replace(/\s+/g, '');
    gunz = zlib.gunzipSync(Buffer.from(b64, 'base64'));
  }

  const Commands = loadCommandsType();
  const err = Commands.verify(gunz);
  if (err) throw new Error('verify: ' + err);
  const msg = Commands.decode(gunz);

  const json = JSON.stringify(msg.toJSON ? msg.toJSON() : msg, null, 2);
  if (maxJson > 0 && json.length > maxJson) {
    console.log(json.slice(0, maxJson));
    console.error(
      `\n... truncated (${json.length} chars). Use --max-json 0 for full output.`
    );
  } else {
    console.log(json);
  }
}

main();
