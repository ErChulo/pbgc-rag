/* Native SQLite 3 rowid-table reader v1.1.0. No SQL is executed.
 * Bounds: 16 MiB database and cumulative logical payload bytes, 100000 table
 * records, 2000 columns, 64 b-tree levels, 500000 index cells. Overflow chains
 * use only uniquely owned in-range pages and must end at the exact payload size.
 * WAL, encrypted, WITHOUT ROWID/generated and unsupported schemas still refuse.
 * Index/freelist/pointer-map pages are inspected only for physical ownership;
 * index content is not exposed as source evidence or used to execute a query.
 */
(function (root) {
  'use strict';
  const MAX_BYTES = 16 * 1024 * 1024, MAX_ROWS = 100000, MAX_COLUMNS = 2000;
  const SQLITE_LIMITS = Object.freeze({ databaseBytes: MAX_BYTES, totalPayloadBytes: MAX_BYTES, records: MAX_ROWS, columns: MAX_COLUMNS, treeDepth: 64, indexCells: 500000 });
  function fail(message) { throw new Error('SQLite: ' + message); }
  function integerValue(n) { return n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(n) : n.toString(); }
  function parseSQLite(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > MAX_BYTES) fail('invalid size; limit is 16 MiB.');
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = String.fromCharCode(...bytes.subarray(0, 16));
    if (ascii !== 'SQLite format 3\0') fail('not an unencrypted SQLite 3 database.');
    const pageSize = data.getUint16(16) === 1 ? 65536 : data.getUint16(16);
    if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0 || bytes.length % pageSize) fail('invalid or truncated page size.');
    if (bytes[18] !== 1 || bytes[19] !== 1) fail('WAL or unsupported journal format. Checkpoint and export a standalone rollback-journal database first.');
    if (bytes[21] !== 64 || bytes[22] !== 32 || bytes[23] !== 32) fail('unsupported payload fractions.');
    const usable = pageSize - bytes[20], pages = bytes.length / pageSize;
    if (usable < 480 || data.getUint32(28) !== pages || data.getUint32(24) !== data.getUint32(92)) fail('inconsistent database header or incomplete snapshot.');
    const encoding = ({ 1: 'utf-8', 2: 'utf-16le', 3: 'utf-16be' })[data.getUint32(56)];
    if (!encoding) fail('unsupported database text encoding.');
    const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
    const owners = new Map(), roots = new Set([1]); let rowCount = 0, totalPayload = 0, indexCells = 0;
    function claimPage(page, kind) {
      if (!Number.isInteger(page) || page < 1 || page > pages || owners.has(page)) fail('invalid, shared, or cyclic ' + kind + ' page ownership.');
      owners.set(page, kind);
    }
    // Free pages and auto-vacuum pointer-map pages cannot serve as live payload.
    const largestRoot = data.getUint32(52);
    if (largestRoot > pages) fail('invalid auto-vacuum root page.');
    if (largestRoot) for (let page = 2; page <= pages; page += Math.floor(usable / 5) + 1) claimPage(page, 'pointer-map');
    const freeCount = data.getUint32(36); let trunk = data.getUint32(32), freeSeen = 0;
    if (freeCount > pages || (!freeCount && trunk)) fail('invalid freelist header.');
    while (trunk) {
      if (trunk === 1 || ++freeSeen > freeCount) fail('invalid freelist chain.');
      claimPage(trunk, 'freelist trunk');
      const base = (trunk - 1) * pageSize, count = data.getUint32(base + 4);
      if (count > Math.floor(usable / 4) - 2) fail('freelist trunk exceeds page bounds.');
      for (let i = 0; i < count; i++) {
        const leaf = data.getUint32(base + 8 + i * 4);
        if (leaf === 1 || ++freeSeen > freeCount) fail('invalid freelist leaf.');
        claimPage(leaf, 'freelist leaf');
      }
      trunk = data.getUint32(base);
    }
    if (freeSeen !== freeCount) fail('truncated freelist chain.');
    function range(start, length, end = bytes.length) { if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || length < 0 || start < 0 || start + length > end || end > bytes.length) fail('out-of-bounds cell or record.'); }
    function varint(pos, end, buffer = bytes) {
      let n = 0n;
      for (let i = 0; i < 9; i++) {
        if (pos + i < 0 || pos + i >= end || end > buffer.length) fail('truncated record varint.');
        const b = buffer[pos + i];
        if (i === 8) return { value: (n << 8n) | BigInt(b), next: pos + 9 };
        n = (n << 7n) | BigInt(b & 127);
        if (b < 128) return { value: n, next: pos + i + 1 };
      }
      fail('invalid varint.');
    }
    function small(v, max, what) { if (v > BigInt(max)) fail(what + ' exceeds limits.'); return Number(v); }
    function signed(buffer, pos, length) {
      let value = 0n; for (let i = 0; i < length; i++) value = (value << 8n) | BigInt(buffer[pos + i]);
      if (buffer[pos] & 128) value -= 1n << BigInt(length * 8);
      return integerValue(value);
    }
    function record(buffer) {
      const start = 0, size = buffer.length, end = size;
      const recordView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const hs = varint(start, end, buffer), headerSize = small(hs.value, size, 'record header');
      if (headerSize < hs.next - start) fail('invalid record header.');
      const headerEnd = start + headerSize, types = []; let p = hs.next;
      while (p < headerEnd) {
        const v = varint(p, headerEnd, buffer); types.push(small(v.value, MAX_BYTES * 2 + 13, 'serial type')); p = v.next;
        if (types.length > MAX_COLUMNS) fail('column limit exceeded.');
      }
      let body = headerEnd; const values = [];
      for (const t of types) {
        const length = t === 0 || t === 8 || t === 9 ? 0 : t >= 12 ? Math.floor((t - 12) / 2) : [0, 1, 2, 3, 4, 6, 8, 8][t];
        if (t === 10 || t === 11 || length === undefined) fail('reserved serial type.');
        if (body + length > end) fail('out-of-bounds record field.');
        let value;
        if (t === 0) value = null;
        else if (t === 8 || t === 9) value = t - 8;
        else if (t <= 6) value = signed(buffer, body, length);
        else if (t === 7) { value = recordView.getFloat64(body); if (!Number.isFinite(value)) fail('non-finite real value is unsupported.'); }
        else if (t % 2) { try { value = decoder.decode(buffer.subarray(body, body + length)); } catch { fail('invalid text encoding.'); } }
        else value = { type: 'blob', hex: Array.from(buffer.subarray(body, body + length), n => n.toString(16).padStart(2, '0')).join('') };
        values.push(value); body += length;
      }
      if (body !== end) fail('record payload length mismatch.');
      return values;
    }
    function readPayload(start, size, end, page, index = false) {
      if (size < 1 || (totalPayload += size) > SQLITE_LIMITS.totalPayloadBytes) fail('cumulative payload budget exceeded or empty record payload.');
      const maxLocal = index ? Math.floor((usable - 12) * 64 / 255) - 23 : usable - 35;
      const minLocal = Math.floor((usable - 12) * 32 / 255) - 23;
      let local = size;
      if (size > maxLocal) { const k = minLocal + (size - minLocal) % (usable - 4); local = k <= maxLocal ? k : minLocal; }
      range(start, local + (local < size ? 4 : 0), end);
      const payload = new Uint8Array(size), segments = [{ kind: 'local', page, byteOffset: start, length: local, payloadOffset: 0 }];
      payload.set(bytes.subarray(start, start + local));
      let filled = local, next = local < size ? data.getUint32(start + local) : 0;
      const cellEnd = start + local + (local < size ? 4 : 0);
      while (filled < size) {
        if (!next || roots.has(next)) fail('truncated overflow chain or overflow pointer targets a b-tree root.');
        claimPage(next, 'overflow');
        const base = (next - 1) * pageSize, length = Math.min(usable - 4, size - filled);
        range(base + 4, length, base + usable);
        payload.set(bytes.subarray(base + 4, base + 4 + length), filled);
        segments.push({ kind: 'overflow', page: next, byteOffset: base + 4, length, payloadOffset: filled });
        filled += length; next = data.getUint32(base);
      }
      if (next !== 0) fail('overflow chain has extra pages, a cycle, or an impossible terminal pointer.');
      return { payload, segments, cellEnd };
    }
    // Index roots are not queried, but their b-trees and overflow pages must not
    // be borrowed by an input table's overflow chain.
    function inspectIndex(page, depth = 0) {
      if (depth > SQLITE_LIMITS.treeDepth) fail('index b-tree depth limit exceeded.');
      claimPage(page, 'index b-tree');
      const base = (page - 1) * pageSize, end = base + usable;
      range(base, 8, end); const type = bytes[base];
      if (type !== 2 && type !== 10) fail('invalid index b-tree page type.');
      const count = data.getUint16(base + 3), headerSize = type === 2 ? 12 : 8;
      range(base, headerSize + count * 2, end);
      const pointerEnd = base + headerSize + count * 2, content = data.getUint16(base + 5) || 65536, intervals = [];
      if (content > usable || base + content < pointerEnd) fail('invalid index content boundary.');
      for (let i = 0; i < count; i++) {
        if (++indexCells > SQLITE_LIMITS.indexCells) fail('index cell limit exceeded.');
        const cell = base + data.getUint16(base + headerSize + i * 2);
        if (cell < base + content || cell < pointerEnd || cell >= end) fail('invalid index cell pointer.');
        range(cell, type === 2 ? 4 : 0, end);
        const size = varint(cell + (type === 2 ? 4 : 0), end);
        const result = readPayload(size.next, small(size.value, MAX_BYTES, 'index payload'), end, page, true);
        intervals.push([cell, result.cellEnd]);
        if (type === 2) inspectIndex(data.getUint32(cell), depth + 1);
      }
      intervals.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < intervals.length; i++) if (intervals[i][0] < intervals[i - 1][1]) fail('overlapping index cells.');
      if (type === 2) inspectIndex(data.getUint32(base + 8), depth + 1);
    }
    function walk(page, depth = 0, lower = null, upper = null) {
      if (depth > SQLITE_LIMITS.treeDepth) fail('table b-tree depth limit exceeded.');
      claimPage(page, 'table b-tree');
      const base = (page - 1) * pageSize, end = base + usable, header = base + (page === 1 ? 100 : 0);
      range(header, 8, end); const type = bytes[header];
      if (type !== 13 && type !== 5) fail('only ordinary rowid table b-trees are supported (no index/without-rowid tables).');
      const count = data.getUint16(header + 3), headerBytes = type === 5 ? 12 : 8;
      range(header, headerBytes + count * 2, end);
      const pointerEnd = header + headerBytes + count * 2;
      const content = data.getUint16(header + 5) || 65536;
      if (content > usable || base + content < pointerEnd) fail('invalid b-tree content boundary.');
      const rows = [], intervals = []; let lastRowid = null;
      for (let i = 0; i < count; i++) {
        const offset = data.getUint16(header + headerBytes + i * 2), cell = base + offset;
        if (offset < content || cell < pointerEnd || cell >= end) fail('invalid cell pointer.');
        if (type === 5) {
          range(cell, 4, end); const key = varint(cell + 4, end); const signedKey = key.value >= (1n << 63n) ? key.value - (1n << 64n) : key.value;
          if ((lastRowid !== null && signedKey <= lastRowid) || (lower !== null && signedKey <= lower) || (upper !== null && signedKey > upper)) fail('unordered interior rowid.');
          const childRows = walk(data.getUint32(cell), depth + 1, lastRowid === null ? lower : lastRowid, signedKey);
          for (const row of childRows) rows.push(row);
          lastRowid = signedKey; intervals.push([cell, key.next]);
        } else {
          const payload = varint(cell, end), rowid = varint(payload.next, end), size = small(payload.value, MAX_BYTES, 'payload');
          const decoded = readPayload(rowid.next, size, end, page);
          const key = rowid.value >= (1n << 63n) ? rowid.value - (1n << 64n) : rowid.value;
          if ((lastRowid !== null && key <= lastRowid) || (lower !== null && key <= lower) || (upper !== null && key > upper)) fail('unordered leaf rowid.'); lastRowid = key;
          rows.push({ rowid: integerValue(key), values: record(decoded.payload), payloadBytes: size, payloadSegments: decoded.segments, page, cell: i + 1, byteOffset: cell });
          intervals.push([cell, decoded.cellEnd]);
          if (++rowCount > MAX_ROWS) fail('record limit exceeded.');
        }
      }
      intervals.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < intervals.length; i++) if (intervals[i][0] < intervals[i - 1][1]) fail('overlapping cells.');
      if (type === 5) for (const row of walk(data.getUint32(header + 8), depth + 1, lastRowid === null ? lower : lastRowid, upper)) rows.push(row);
      return rows;
    }
    const schema = walk(1), tables = [], indexes = [];
    for (const entry of schema) {
      if (entry.values.length !== 5) fail('invalid sqlite_schema entry.');
      const [type, name, table, rootpage, sql] = entry.values;
      if (type !== 'table' && type !== 'index') continue;
      if (!Number.isInteger(rootpage) || rootpage < 1 || rootpage > pages || roots.has(rootpage) || owners.has(rootpage)) fail('invalid or shared schema root page.');
      roots.add(rootpage);
      if (type === 'index') { indexes.push(rootpage); continue; }
      if (typeof name === 'string' && name.startsWith('sqlite_')) { tables.push({ name, rootpage, internal: true }); continue; }
      if (typeof name !== 'string' || name !== table || !Number.isInteger(rootpage) || rootpage < 1 || typeof sql !== 'string') fail('virtual or invalid table schema is unsupported.');
      tables.push({ name, rootpage, ...parseSchema(sql) });
    }
    for (const index of indexes) inspectIndex(index);
    const out = [];
    for (const table of tables) {
      const rows = walk(table.rootpage);
      if (table.internal) continue;
      for (const row of rows) {
        if (row.values.length !== table.columns.length) fail('added/default/generated or mismatched column storage is unsupported. Export a rebuilt table.');
        const fields = Object.create(null);
        table.columns.forEach((column, index) => { fields[column] = table.alias === column ? row.rowid : row.values[index]; });
        out.push({ text: table.columns.map(column => column + ': ' + (typeof fields[column] === 'object' && fields[column] !== null ? JSON.stringify(fields[column]) : String(fields[column]))).join(' | '), fields, locator: { kind: 'sqlite', label: 'Table ' + table.name + ', rowid ' + row.rowid, table: table.name, rowid: row.rowid, columns: [...table.columns], page: row.page, cell: row.cell, byteOffset: row.byteOffset, payloadBytes: row.payloadBytes, payloadSegments: row.payloadSegments } });
      }
    }
    return out;
  }
  function parseSchema(sql) {
    if (/\b(?:VIRTUAL|GENERATED)\b/i.test(sql) || /\bWITHOUT\s+ROWID\b/i.test(sql)) fail('virtual, generated, or WITHOUT ROWID tables are unsupported.');
    // Tokenize quoted identifiers and strings before splitting definitions; never execute schema SQL.
    const tokens = []; let i = 0;
    while (i < sql.length) {
      if (/\s/.test(sql[i])) { i++; continue; }
      if (sql.startsWith('--', i) || sql.startsWith('/*', i)) fail('schema comments are unsupported.');
      const c = sql[i];
      if ('"\'`['.includes(c)) {
        const close = c === '[' ? ']' : c; let value = '', closed = false; i++;
        while (i < sql.length) { if (sql[i] === close) { if (c !== '[' && sql[i + 1] === close) { value += close; i += 2; } else { i++; closed = true; break; } } else value += sql[i++]; }
        if (!closed) fail('unterminated schema identifier.'); tokens.push({ value, quoted: true });
      } else if (/[(),;]/.test(c)) { tokens.push({ value: c }); i++; }
      else { const start = i; while (i < sql.length && !/[\s(),;"'`\[]/.test(sql[i])) i++; if (i === start) fail('invalid schema token.'); tokens.push({ value: sql.slice(start, i) }); }
      if (tokens.length > 50000) fail('schema token limit exceeded.');
    }
    const upper = t => t && !t.quoted ? t.value.toUpperCase() : '';
    if (upper(tokens[0]) !== 'CREATE' || upper(tokens[1]) !== 'TABLE') fail('only CREATE TABLE schemas are supported.');
    let at = 2; if (upper(tokens[at]) === 'IF' && upper(tokens[at + 1]) === 'NOT' && upper(tokens[at + 2]) === 'EXISTS') at += 3;
    if (!tokens[at] || !tokens[at + 1] || tokens[at + 1].value !== '(') fail('unsupported CREATE TABLE declaration.');
    at += 2; let depth = 0, part = [], parts = [], closed = false;
    for (; at < tokens.length; at++) {
      const t = tokens[at];
      if (!t.quoted && t.value === '(') depth++;
      if (!t.quoted && t.value === ')') { if (!depth) { if (part.length) parts.push(part); closed = true; at++; break; } depth--; }
      if (!t.quoted && t.value === ',' && depth === 0) { if (!part.length) fail('empty column declaration.'); parts.push(part); part = []; } else part.push(t);
    }
    if (!closed || depth || parts.length > MAX_COLUMNS || tokens.slice(at).some(t => t.value !== ';' && upper(t) !== 'STRICT')) fail('unsupported table options or malformed schema.');
    const columns = [], definitions = new Map(); let tablePK = null;
    for (let p of parts) {
      let first = upper(p[0]); if (first === 'CONSTRAINT') { p = p.slice(2); first = upper(p[0]); }
      if (['PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'].includes(first)) {
        if (first === 'PRIMARY') { if (upper(p[1]) !== 'KEY' || p[2]?.value !== '(' || p[4]?.value !== ')') fail('composite or decorated primary keys are unsupported.'); tablePK = p[3]?.value; }
        continue;
      }
      const name = p[0]?.value;
      if (!name || name.length > 500 || ['__proto__', 'constructor', 'prototype'].includes(name) || columns.some(c => c.toLowerCase() === name.toLowerCase())) fail('invalid or duplicate column name.');
      if (p.some(t => upper(t) === 'AS')) fail('generated columns are unsupported.');
      columns.push(name); definitions.set(name, p.slice(1));
    }
    if (!columns.length) fail('table has no readable columns.');
    let alias = null;
    for (const [name, p] of definitions) {
      const text = p.map(upper); const pk = text.indexOf('PRIMARY');
      const integer = p[0]?.value.toUpperCase() === 'INTEGER' && (text.length === 1 || ['PRIMARY', 'NOT', 'UNIQUE', 'CHECK', 'DEFAULT', 'COLLATE', 'REFERENCES', 'CONSTRAINT'].includes(text[1]));
      if (integer && ((pk >= 0 && text[pk + 1] === 'KEY' && text[pk + 2] !== 'DESC') || (tablePK && tablePK.toLowerCase() === name.toLowerCase()))) alias = name;
    }
    return { columns, alias };
  }
  root.PBGC = Object.assign(root.PBGC || {}, { parseSQLite, SQLITE_PARSER_VERSION: '1.1.0', SQLITE_LIMITS });
  if (typeof module === 'object' && module.exports) module.exports = { parseSQLite, SQLITE_PARSER_VERSION: '1.1.0', SQLITE_LIMITS };
})(globalThis);
