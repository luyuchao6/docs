/**
 * Turn decoded Feishu `Commands` JSON (from sheet block protobuf) into 2D string grids.
 *
 * Feishu `GridRange` uses **exclusive** endRow/endCol for this API shape:
 *   cellCount === (endRow - startRow) * (endCol - startCol)
 *
 * **Cell values** resolve via `cells[]` + `valueId` into `valueRefDelta` pools — the
 * `strings` array is indexed by id (repeated texts share one pool entry). Optional
 * `valueId` must not default to `0` when absent or every missing id resolves to
 * `strings[0]`.
 *
 * **Merged cells** (`snapshot.gzipResource`, often `SimpleCommands`): only the anchor
 * cell may carry a value. After building the dense grid, we fill empty cells in each
 * merge with the first non-empty value (row-major). `gzipResource` may decode as
 * `Commands` or `SimpleCommands`; both are scanned for merge mutations.
 */

/** @param {{ startRow?: number, endRow?: number, startCol?: number, endCol?: number }} range */
export function gridSizeFromRange(range) {
  const sr = range.startRow ?? 0;
  const sc = range.startCol ?? 0;
  const er = range.endRow ?? 0;
  const ec = range.endCol ?? 0;
  const rows = er - sr;
  const cols = ec - sc;
  return { rows, cols, startRow: sr, startCol: sc };
}

/**
 * @param {object} cell - protobufjs Cell toJSON
 * @param {{ numbers?: number[], strings?: string[], richStrings?: object[] }} pools
 */
export function formatCellValue(cell, pools) {
  if (!cell || typeof cell !== 'object') return '';
  const keys = Object.keys(cell);
  if (keys.length === 0) return '';
  if (!cell.valueType) {
    if ('styleId' in cell && keys.length === 1) return '';
    return '';
  }
  const n = pools.numbers ?? [];
  const s = pools.strings ?? [];
  switch (cell.valueType) {
    case 'CellValueType_Number': {
      if (!('valueId' in cell)) return '';
      return n[cell.valueId] ?? '';
    }
    case 'CellValueType_String': {
      if (!('valueId' in cell)) return '';
      return s[cell.valueId] ?? '';
    }
    case 'CellValueType_RichString': {
      if (!('valueId' in cell)) return '';
      const rs = (pools.richStrings ?? [])[cell.valueId];
      if (rs && typeof rs === 'object' && 'textId' in rs) {
        return `[RichText#${rs.textId}]`;
      }
      return '[RichText]';
    }
    default:
      return '';
  }
}

/**
 * Intersection of two GridRanges (exclusive ends), or null if empty.
 * @param {{ startRow?: number, endRow?: number, startCol?: number, endCol?: number }} a
 * @param {{ startRow?: number, endRow?: number, startCol?: number, endCol?: number }} b
 */
export function intersectGridRanges(a, b) {
  const sr = Math.max(a.startRow ?? 0, b.startRow ?? 0);
  const sc = Math.max(a.startCol ?? 0, b.startCol ?? 0);
  const er = Math.min(a.endRow ?? 0, b.endRow ?? 0);
  const ec = Math.min(a.endCol ?? 0, b.endCol ?? 0);
  if (sr >= er || sc >= ec) return null;
  return { startRow: sr, startCol: sc, endRow: er, endCol: ec };
}

function isEmptyCell(v) {
  return v === '' || v == null;
}

function firstNonEmptyInRect(grid, r0, c0, r1, c1) {
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const v = grid[r]?.[c];
      if (!isEmptyCell(v) && String(v).length > 0) return String(v);
    }
  }
  return '';
}

/**
 * Copy the first non-empty value in each merge (row-major) to empty cells in that
 * merge, clipped to the block grid.
 * @param {string[][]} grid - mutated in place
 * @param {object[]} mergeRanges
 * @param {{ startRow?: number, endRow?: number, startCol?: number, endCol?: number, sheetId?: string }} blockRange - SetRangeValues.range
 */
export function applyMergeFillToGrid(grid, mergeRanges, blockRange) {
  if (!mergeRanges?.length || !grid.length) return grid;
  const br = blockRange;
  const nRows = grid.length;
  const nCols = grid[0]?.length ?? 0;
  const brSid = br.sheetId;

  for (const mr of mergeRanges) {
    if (brSid != null && mr.sheetId != null && mr.sheetId !== brSid) continue;
    const inter = intersectGridRanges(mr, br);
    if (!inter) continue;

    const r0 = inter.startRow - (br.startRow ?? 0);
    const c0 = inter.startCol - (br.startCol ?? 0);
    const r1 = inter.endRow - (br.startRow ?? 0);
    const c1 = inter.endCol - (br.startCol ?? 0);

    const r0c = Math.max(0, r0);
    const c0c = Math.max(0, c0);
    const r1c = Math.min(nRows, r1);
    const c1c = Math.min(nCols, c1);
    if (r0c >= r1c || c0c >= c1c) continue;

    const master = firstNonEmptyInRect(grid, r0c, c0c, r1c, c1c);
    if (master === '') continue;

    for (let r = r0c; r < r1c; r++) {
      for (let c = c0c; c < c1c; c++) {
        if (isEmptyCell(grid[r][c])) grid[r][c] = master;
      }
    }
  }
  return grid;
}

function mergeRangeKey(r) {
  return `${r.sheetId ?? ''}:${r.startRow ?? 0}:${r.startCol ?? 0}:${r.endRow ?? 0}:${r.endCol ?? 0}`;
}

/**
 * Walk resource `Commands` or `SimpleCommands` and return final active merge ranges per sheetId.
 * @param {object} resourceCommandsJson
 * @returns {Map<string, object[]>} sheetId -> GridRange[]
 */
export function collectMergeRangesBySheet(resourceCommandsJson) {
  const active = new Map();
  for (const cmd of resourceCommandsJson.commands || []) {
    for (const m of cmd.mutations || []) {
      if (m.mergeCells) {
        for (const r of m.mergeCells.ranges || []) {
          active.set(mergeRangeKey(r), r);
        }
      }
      if (m.unmergeCells) {
        const r = m.unmergeCells.range;
        if (r) active.delete(mergeRangeKey(r));
      }
    }
  }
  const bySheet = new Map();
  for (const r of active.values()) {
    const sid = r.sheetId ?? '';
    if (!bySheet.has(sid)) bySheet.set(sid, []);
    bySheet.get(sid).push(r);
  }
  return bySheet;
}

/**
 * Dense grid from one SetRangeValues mutation (no merge fill).
 * @param {object} setRangeValues
 * @returns {string[][]}
 */
export function buildGridFromSetRangeValues(setRangeValues) {
  const srv = setRangeValues;
  const range = srv.range;
  if (!range) throw new Error('setRangeValues missing range');
  const { rows, cols } = gridSizeFromRange(range);
  const pools = srv.valueRefDelta || {};
  const cellIds = srv.cells?.cellIds;
  const cellArr = srv.cells?.cells;
  if (!cellIds || !cellArr) {
    throw new Error('setRangeValues missing cells.cellIds / cells.cells');
  }
  const expected = rows * cols;
  if (cellIds.length !== expected) {
    throw new Error(
      `cellIds length ${cellIds.length} !== ${rows}×${cols}=${expected}; range=${JSON.stringify(range)}`
    );
  }
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const slot = cellIds[i];
      const cell = slot ? cellArr[slot - 1] : {};
      row.push(formatCellValue(cell, pools));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * @param {object} setRangeValues
 * @param {object[]} [mergeRanges]
 * @returns {string[][]}
 */
export function setRangeValuesToGrid(setRangeValues, mergeRanges = []) {
  const grid = buildGridFromSetRangeValues(setRangeValues);
  const range = setRangeValues.range;
  if (mergeRanges.length && range) {
    applyMergeFillToGrid(grid, mergeRanges, range);
  }
  return grid;
}

/**
 * @param {{ sheetId: string, range: object, grid: string[][] }[]} parts
 */
export function compositeSetRangeParts(parts) {
  let sr = Infinity;
  let sc = Infinity;
  let er = -Infinity;
  let ec = -Infinity;
  for (const p of parts) {
    const r = p.range;
    const r0 = r.startRow ?? 0;
    const r1 = r.endRow ?? 0;
    const c0 = r.startCol ?? 0;
    const c1 = r.endCol ?? 0;
    sr = Math.min(sr, r0);
    sc = Math.min(sc, c0);
    er = Math.max(er, r1);
    ec = Math.max(ec, c1);
  }
  const rows = er - sr;
  const cols = ec - sc;
  const master = Array.from({ length: rows }, () => Array(cols).fill(''));
  for (const p of parts) {
    const r = p.range;
    const br = r.startRow ?? 0;
    const bc = r.startCol ?? 0;
    const r0 = br - sr;
    const c0 = bc - sc;
    for (let i = 0; i < p.grid.length; i++) {
      for (let j = 0; j < p.grid[i].length; j++) {
        master[r0 + i][c0 + j] = p.grid[i][j] ?? '';
      }
    }
  }
  return {
    sheetId: parts[0].sheetId,
    range: {
      sheetId: parts[0].range?.sheetId,
      startRow: sr,
      startCol: sc,
      endRow: er,
      endCol: ec,
    },
    grid: master,
  };
}

/**
 * Extract grids from one decoded `Commands` object (one block). Multiple
 * `SetRangeValues` mutations for the same sheet are composited into one grid.
 * @param {object[]} mergeRangesForSheet - merge ranges for this sheet (from gzipResource)
 * @returns {{ sheetId: string, grid: string[][] }[]}
 */
export function commandsToSheetGrids(commandsJson, mergeRangesForSheet = []) {
  const cmds = commandsJson.commands;
  if (!Array.isArray(cmds)) return [];
  const parts = [];
  for (const cmd of cmds) {
    const muts = cmd.mutations;
    if (!Array.isArray(muts)) continue;
    for (const m of muts) {
      if (m.setRangeValues && m.type === 'MutationType_SetRangeValues') {
        const srv = m.setRangeValues;
        const sheetId = srv.range?.sheetId ?? 'sheet';
        const grid = buildGridFromSetRangeValues(srv);
        parts.push({ sheetId, range: srv.range, grid });
      }
    }
  }
  if (parts.length === 0) return [];

  const bySheet = new Map();
  for (const p of parts) {
    if (!bySheet.has(p.sheetId)) bySheet.set(p.sheetId, []);
    bySheet.get(p.sheetId).push(p);
  }

  const out = [];
  for (const [, sheetParts] of bySheet) {
    const merged =
      sheetParts.length === 1
        ? {
            sheetId: sheetParts[0].sheetId,
            range: sheetParts[0].range,
            grid: sheetParts[0].grid,
          }
        : compositeSetRangeParts(sheetParts);
    if (mergeRangesForSheet.length) {
      applyMergeFillToGrid(merged.grid, mergeRangesForSheet, merged.range);
    }
    out.push({ sheetId: merged.sheetId, grid: merged.grid });
  }
  return out;
}
