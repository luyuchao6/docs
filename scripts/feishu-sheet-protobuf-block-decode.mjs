/**
 * Shared: gzip base64 block → protobuf `Commands` → plain JSON.
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

let _commandsType = null;
let _protobufRoot = null;

function loadProtobufRoot() {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Missing ${schemaPath}. Run: npm run feishu:sheet-extract-schema`
    );
  }
  if (!_protobufRoot) {
    const Vu = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    _protobufRoot = protobuf.Root.fromJSON(Vu);
    _commandsType = _protobufRoot.lookupType('Commands');
  }
  return _protobufRoot;
}

export function loadCommandsType() {
  return loadProtobufRoot().lookupType('Commands');
}

/**
 * @param {string} b64 - base64 gzip protobuf
 * @param {string} messageName - e.g. "Commands", "SimpleCommands"
 */
export function decodeGzipBase64As(b64, messageName) {
  const gunz = zlib.gunzipSync(Buffer.from(String(b64).trim(), 'base64'));
  const Type = loadProtobufRoot().lookupType(messageName);
  const err = Type.verify(gunz);
  if (err) throw new Error(`${messageName}.verify: ${err}`);
  return Type.decode(gunz).toJSON();
}

export function decodeGzipBase64Block(b64) {
  const gunz = zlib.gunzipSync(Buffer.from(String(b64).trim(), 'base64'));
  const Commands = loadCommandsType();
  const err = Commands.verify(gunz);
  if (err) throw new Error(`Commands.verify: ${err}`);
  return Commands.decode(gunz).toJSON();
}
