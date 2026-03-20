/**
 * Walk blockMap in the same order as feishu-client-vars-to-markdown `renderTree` (images only).
 */
export function collectImageTokensInOrder(blockMap, pageId) {
  const out = [];
  const root = blockMap[pageId]?.data?.children;

  function walk(childIds) {
    for (const id of childIds || []) {
      const b = blockMap[id];
      if (!b?.data) continue;
      const d = b.data;
      const t = d.type;
      if (t === 'table_cell') continue;

      if (t === 'page') {
        walk(d.children);
        continue;
      }
      if (t === 'grid' || t === 'grid_column' || t === 'column_list' || t === 'column' || t === 'callout') {
        walk(d.children);
        continue;
      }
      if (t === 'ordered') {
        walk(d.children);
        continue;
      }
      if (t === 'image') {
        const im = d.image || d;
        const tok = im?.token || d.token;
        if (tok) out.push(tok);
        walk(d.children);
        continue;
      }
      if (t === 'divider') continue;
      if (
        t === 'heading1' ||
        t === 'heading2' ||
        t === 'heading3' ||
        t === 'heading4' ||
        t === 'heading5' ||
        t === 'heading6'
      ) {
        walk(d.children);
        continue;
      }
      if (t === 'code') continue;
      if (t === 'table') {
        const rows = d.rows_id || [];
        const cols = d.columns_id || [];
        const cs = d.cell_set || {};
        for (const r of rows) {
          for (const c of cols) {
            const ent = cs[r + c];
            if (ent?.block_id) {
              const cell = blockMap[ent.block_id];
              walk(cell?.data?.children);
            }
          }
        }
        continue;
      }
      if (t === 'bullet' || t === 'text') {
        walk(d.children);
        continue;
      }
      if (d.children?.length) walk(d.children);
    }
  }

  walk(root);
  return out;
}
