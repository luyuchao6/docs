# Feishu sheet snapshots — protobuf reverse notes

The web client (`index_merged.js` in the Bear sheet bundle) decodes the **gzip** blobs from `client_vars` into a **protobuf** message named **`Commands`**, then applies those **commands** (mutations) to the in-memory workbook model.

This is **not** a public API; it is **internal** to the Feishu/Lark web app. The schema is **shipped in the client** as a protobufjs `fromJSON` tree (`Vu`).

## Where the client defines decode (source)

Bundle: `…/eesz/bear/sheet/module/ee/bear_web/sheet/<version>/index_merged.js` (URL changes with releases).

1. **`decodeSnapshotBeforeApply`** — calls `Z6r` on `gzipTopSnapshot`, `gzipResource`, and each `blocks[blockId]`:

   - `topSnapshot = Z6r(gzipTopSnapshot)`
   - `resource = Z6r(gzipResource)`
   - `blocksCommands[id] = Z6r(blocks[id])`

2. **`Z6r`** → implementation **`Uu`** (minified names):

   ```text
   Uu(e) {
     t = Ke.ungzip(e, true)   // base64 gzip string → bytes
     n = Zu().decode(t)       // protobuf decode
     ju(n, {})                 // normalize Long → number on the result tree
     return n
   }
   ```

3. **`Zu()`** — lazy singleton:

   ```text
   Hu = protobuf.Root.fromJSON(Vu)
   return Hu.lookupType("Commands")
   ```

So each blob is: **`base64` → `gzip` → protobuf `Commands`**.

## Root message

- **`Commands`**: `repeated Command commands = 1`

- **`Command`**: `CommandType type`, `repeated Mutation mutations`, `sheetId`, `resourceRefs`, …

- **`Mutation`** is a **oneof** (protobufjs `nested.Mutation.fields`): one field per mutation kind, e.g.:

  - `setCellValues` → `SetCellValuesMutation`
  - `setRangeValues` → `SetRangeValuesMutation`
  - `insertDimension`, `mergeCells`, `setSheetProperties`, …

Relevant for cell text:

- **`SetCellValuesMutation` / `SetRangeValuesMutation`**: `GridRange range`, **`CellValueRefDelta`** (`valueRefDelta`), **`Cell`**, etc.

## Indirection: cells reference value pools

`Cell` does **not** usually carry plain text inline. It carries **`valueType`**, **`valueId`**, **`formulaId`**, style ids, etc. Actual numbers/strings/formulas live in **`CellValueRefDelta`**:

- `repeated double numbers`
- `repeated string strings`
- `repeated RichString richStrings`
- `repeated string formulaStrings`
- …

So after `Commands.decode` you have **IDs**; resolving them to a TSV requires the same **delta / resource merge** logic the client uses (order of application, `offsetRange` from `cellBlockMetaMap`, etc.). **`gzipResource`** decodes to the same **`Commands`** shape and is merged for **layout** (column widths, styles, …).

## Practical takeaway

| Step | What you get |
|------|----------------|
| Gunzip `snapshot.blocks[id]` | Raw protobuf bytes |
| `Commands.decode(bytes)` | Structured **mutation list** with `SetCellValues` / `SetRangeValues` and **value pools** |
| Map `valueId` → string/number | Needs **resource** snapshot + **mutation ordering** (same as `applyMutationSnapshot` in `sheet_core`) |

Fully reproducing the UI grid is **re-implementing** the spreadsheet engine’s apply path. For **one-off export**, clipboard or DOM automation is still the pragmatic path; this protobuf is the **canonical** representation if you invest in a full merge.

## Repo tooling

- **`extract-feishu-sheet-commands-schema.mjs`** — downloads the current `index_merged.js`, extracts `Vu`, writes `scripts/generated/feishu-sheet-commands-vu.json` (gitignored).
- **`feishu-sheet-decode-commands.mjs`** — decodes one block to JSON. Input options:
  - A **file containing only** the base64 gzip string (from `data.snapshot.blocks[id]`), or
  - **`--from-client-vars-json path.json`** — full response saved from DevTools → Network → `sheet/client_vars` (so you do not need to hand-create `block.b64`).

## Version drift

`Vu` and `index_merged.js` change with Feishu releases. Re-run the extractor when decode fails after a deploy.
