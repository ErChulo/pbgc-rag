/* Native, bounded OOXML text extraction. No macros, formula evaluation or external resources. */
(function (root) {
  'use strict';
  const LIMIT = Object.freeze({ entries: 2048, memberBytes: 16 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, ratio: 200, nodes: 200000, depth: 128, records: 100000 });
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  function fail(message) { throw new Error(`Office import: ${message}`); }
  function utf8(bytes) { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid UTF-8 part or filename.'); } }
  async function inflate(bytes, expected) {
    if (typeof DecompressionStream !== 'function') fail('this browser lacks local ZIP decompression. Use an updated browser; no network fallback is used.');
    let stream;
    try { stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
    catch { fail('this browser lacks raw-deflate decompression.'); }
    const reader = stream.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > expected || size > LIMIT.memberBytes) { await reader.cancel(); fail('decompressed member exceeds its declared size.'); }
        chunks.push(value);
      }
    } catch (error) { fail(`invalid deflate data (${error.message}).`); }
    if (size !== expected) fail('decompressed size does not match the ZIP directory.');
    const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
  }
  async function readZip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > LIMIT.totalBytes) fail('compressed archive exceeds 64 MiB.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = at => { if (at < 0 || at + 2 > bytes.length) fail('truncated ZIP.'); return view.getUint16(at, true); };
    const u32 = at => { if (at < 0 || at + 4 > bytes.length) fail('truncated ZIP.'); return view.getUint32(at, true); };
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) { end = i; break; }
    if (end < 0) fail('not a supported ZIP archive; legacy or encrypted Office formats are unsupported.');
    if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) fail('multi-disk ZIP is unsupported.');
    const count = u16(end + 10), directorySize = u32(end + 12), directoryStart = u32(end + 16);
    if (count === 65535 || directorySize === 0xffffffff || directoryStart === 0xffffffff) fail('ZIP64 is unsupported.');
    if (count > LIMIT.entries || directoryStart + directorySize !== end) fail('ZIP directory exceeds limits or has invalid bounds.');
    const entries = new Map(); let offset = directoryStart, total = 0; const spans = [];
    for (let n = 0; n < count; n++) {
      if (u32(offset) !== 0x02014b50 || offset + 46 > end) fail('invalid ZIP central directory.');
      const flags = u16(offset + 8), method = u16(offset + 10), checksum = u32(offset + 16), compressed = u32(offset + 20), size = u32(offset + 24), nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32), disk = u16(offset + 34), local = u32(offset + 42);
      if (flags & 0x41) fail('encrypted ZIP members are unsupported.');
      if (![0, 8].includes(method) || disk || [compressed, size, local].includes(0xffffffff)) fail('unsupported ZIP method, disk or ZIP64 member.');
      if (size > LIMIT.memberBytes || (total += size) > LIMIT.totalBytes || size > Math.max(compressed, 1) * LIMIT.ratio) fail('ZIP expansion exceeds safe limits.');
      if (offset + 46 + nameLength + extraLength + commentLength > end) fail('truncated ZIP directory entry.');
      const name = utf8(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (!name || name.includes('\\') || name.startsWith('/') || name.includes('\0') || name.split('/').some(x => x === '..' || x === '.') || /^[A-Za-z]:/.test(name) || entries.has(name)) fail('unsafe or duplicate ZIP path.');
      if (u32(local) !== 0x04034b50 || local + 30 > directoryStart) fail('invalid local ZIP header.');
      const localNameLength = u16(local + 26), localExtraLength = u16(local + 28), start = local + 30 + localNameLength + localExtraLength;
      if (u16(local + 6) !== flags || u16(local + 8) !== method || utf8(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name || start + compressed > directoryStart) fail('ZIP local and central entries disagree.');
      if (!(flags & 8) && (u32(local + 14) !== checksum || u32(local + 18) !== compressed || u32(local + 22) !== size)) fail('ZIP sizes or checksums disagree.');
      spans.push([local, start + compressed]);
      const packed = bytes.subarray(start, start + compressed);
      const unpacked = method === 0 ? packed : await inflate(packed, size);
      if (unpacked.length !== size || crc32(unpacked) !== checksum) fail('ZIP member checksum or size mismatch.');
      entries.set(name, unpacked); offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset !== directoryStart + directorySize) fail('ZIP directory size mismatch.');
    spans.sort((a, b) => a[0] - b[0]); for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) fail('overlapping ZIP members.');
    return entries;
  }
  function entity(text) {
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i.test(text)) fail('invalid XML entity.');
    return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, value) => {
      const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      if (Object.hasOwn(map, value)) return map[value];
      const number = value.startsWith('#x') ? parseInt(value.slice(2), 16) : Number(value.slice(1));
      if (!Number.isSafeInteger(number) || (number < 32 && ![9, 10, 13].includes(number)) || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) fail('invalid XML code point.');
      return String.fromCodePoint(number);
    });
  }
  function xml(bytes, part) {
    const text = utf8(bytes); if (/<!DOCTYPE|<!ENTITY/i.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail(`unsafe XML in ${part}.`);
    const document = { name: '#document', children: [], attrs: Object.create(null) }, stack = [document]; let position = 0, nodes = 0;
    const tags = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w:.-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g;
    function addText(value, cdata) { if ((value.includes('<') || value.includes(']]>')) && !cdata) fail(`malformed XML in ${part}.`); if (value.trim() || stack.length > 1) { if (stack.length === 1 && value.trim()) fail(`text outside XML root in ${part}.`); stack[stack.length - 1].children.push(cdata ? value : entity(value)); if (++nodes > LIMIT.nodes) fail('XML node limit exceeded.'); } }
    let match;
    while ((match = tags.exec(text))) {
      addText(text.slice(position, match.index), false); const tag = match[0]; position = tags.lastIndex;
      if (tag.startsWith('<!--')) { if (tag.slice(4, -3).includes('--')) fail('invalid XML comment.'); continue; }
      if (tag.startsWith('<?')) continue;
      if (tag.startsWith('<![CDATA[')) { addText(tag.slice(9, -3), true); continue; }
      const name = /^<\/?([\w:.-]+)/.exec(tag)[1], closing = tag.startsWith('</'), rest = tag.slice(name.length + (closing ? 2 : 1)).replace(/\/?>$/, '');
      if (closing) { if (rest.trim() || stack.length === 1 || stack.pop().name !== name) fail(`mismatched XML element in ${part}.`); continue; }
      if (!/^(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*$/.test(rest)) fail(`malformed XML attributes in ${part}.`);
      const attrs = Object.create(null);
      for (const attr of rest.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) { if (Object.hasOwn(attrs, attr[1])) fail('duplicate XML attribute.'); attrs[attr[1]] = entity(attr[2] === undefined ? attr[3] : attr[2]); }
      const node = { name, local: name.split(':').pop(), attrs, children: [], parent: stack[stack.length - 1] };
      node.parent.children.push(node); if (++nodes > LIMIT.nodes) fail('XML node limit exceeded.');
      if (!tag.endsWith('/>')) { stack.push(node); if (stack.length > LIMIT.depth) fail('XML nesting exceeds safe limits.'); }
    }
    addText(text.slice(position), false);
    const roots = document.children.filter(x => typeof x !== 'string');
    if (stack.length !== 1 || roots.length !== 1) fail(`unclosed or multiple XML roots in ${part}.`);
    return roots[0];
  }
  function children(node, name) { return node.children.filter(x => typeof x !== 'string' && (!name || x.local === name)); }
  function descendants(node, name) { const out = []; function walk(n) { for (const child of children(n)) { if (child.local === name) out.push(child); walk(child); } } walk(node); return out; }
  function textOf(node) { return node.children.map(x => typeof x === 'string' ? x : textOf(x)).join(''); }
  function part(entries, name, optional) { const bytes = entries.get(name); if (!bytes) { if (optional) return null; fail(`required part ${name} is missing.`); } return xml(bytes, name); }
  function spreadsheetString(node) { let value = ''; for (const child of children(node)) { if (child.local === 't') value += textOf(child); else if (child.local === 'r') value += spreadsheetString(child); } return value; }
  function childText(node, name) { const item = children(node, name)[0]; return item ? textOf(item) : ''; }
  function indexAmong(node, name) { return children(node.parent, name).indexOf(node) + 1; }
  function ancestor(node, name) { let p = node.parent; while (p) { if (p.local === name) return p; p = p.parent; } return null; }
  function localAttribute(node, name) {
    const matches = Object.keys(node.attrs).filter(key => key === name || key.endsWith(':' + name));
    if (matches.length > 1) fail(`ambiguous ${name} attribute in Word part.`);
    return matches.length ? node.attrs[matches[0]] : undefined;
  }
  function currentWordNode(node) { return !ancestor(node, 'del') && !ancestor(node, 'moveFrom'); }
  function wordRecords(container, context, records) {
    const tables = descendants(container, 'tbl'), paragraphs = descendants(container, 'p');
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i], pieces = []; if (!currentWordNode(paragraph)) continue;
      function run(node) {
        for (const child of children(node)) {
          if (child.local === 't') pieces.push(textOf(child));
          else if (child.local === 'tab') pieces.push('\t');
          else if (child.local === 'br' || child.local === 'cr') pieces.push('\n');
          else if (!['del', 'moveFrom', 'instrText', 'delInstrText', 'p'].includes(child.local)) run(child);
        }
      }
      run(paragraph); const text = pieces.join(''); if (!text.trim()) continue;
      const table = ancestor(paragraph, 'tbl'), row = ancestor(paragraph, 'tr'), cell = ancestor(paragraph, 'tc');
      const locator = { kind: 'word', part: context.part, role: context.role, paragraph: i + 1, label: `Paragraph ${i + 1}` };
      if (table && row && cell) Object.assign(locator, { table: tables.indexOf(table) + 1, row: indexAmong(row, 'tr'), cell: indexAmong(cell, 'tc'), label: `Table ${tables.indexOf(table) + 1}, row ${indexAmong(row, 'tr')}, cell ${indexAmong(cell, 'tc')}, paragraph ${i + 1}` });
      if (context.noteId !== undefined) locator.noteId = context.noteId;
      if (context.role !== 'body') locator.label = `${context.role[0].toUpperCase() + context.role.slice(1)}${context.noteId === undefined ? '' : ' ' + context.noteId} (${context.part}), ${locator.label[0].toLowerCase() + locator.label.slice(1)}`;
      const style = children(children(paragraph, 'pPr')[0] || { children: [] }, 'pStyle')[0];
      const fields = { style: style ? localAttribute(style, 'val') || '' : '', role: context.role, revisionPolicy: 'current text; deleted and moved-from text and field instructions excluded; cached field results not recalculated' };
      if (context.relationshipIds) fields.relationshipIds = [...context.relationshipIds];
      if (context.referencedInDocument !== undefined) { fields.referencedInDocument = context.referencedInDocument; fields.referencePolicy = 'syntactic references only; rendered pages and legal applicability are not inferred'; }
      if (context.referenceTypes) fields.referenceTypes = [...context.referenceTypes];
      records.push({ text, locator, fields });
      if (records.length > LIMIT.records) fail('record limit exceeded.');
    }
  }
  function docx(entries) {
    const documentPart = 'word/document.xml', doc = part(entries, documentPart);
    if (doc.local !== 'document') fail('Word document root is invalid.');
    const body = children(doc, 'body')[0]; if (!body) fail('Word document body is missing.');
    const records = [];
    wordRecords(body, { part: documentPart, role: 'body' }, records);
    const relRoot = part(entries, 'word/_rels/document.xml.rels', true), relationships = new Map(), related = new Map();
    if (relRoot && relRoot.local !== 'Relationships') fail('Word relationships root is invalid.');
    const supportedType = /^http:\/\/(?:schemas\.openxmlformats\.org\/officeDocument\/2006|purl\.oclc\.org\/ooxml\/officeDocument)\/relationships\/(header|footer|footnotes|endnotes)$/;
    for (const node of relRoot ? children(relRoot, 'Relationship') : []) {
      const rel = node.attrs;
      if (!rel.Id || /\s/.test(rel.Id) || rel.Id.length > 256 || relationships.has(rel.Id) || !rel.Type) fail('invalid or duplicate Word relationship.');
      const type = supportedType.exec(rel.Type);
      relationships.set(rel.Id, { attrs: rel, role: type ? type[1] : null });
      if (!type) continue; // Other relationships, including hyperlinks and media, remain inert.
      if (!rel.Target || (rel.TargetMode && rel.TargetMode !== 'Internal')) fail('external or missing Word text-part relationship.');
      const path = resolveTarget(documentPart, rel.Target);
      if (!path || !path.startsWith('word/') || path === documentPart) fail('Word text-part relationship is outside the supported Word package.');
      const prior = related.get(path);
      if (prior && prior.role !== type[1]) fail('one Word part has conflicting relationship roles.');
      if (prior) prior.relationshipIds.push(rel.Id);
      else related.set(path, { part: path, role: type[1], relationshipIds: [rel.Id], references: [] });
    }
    // Section references validate relationship IDs, but never imply rendered page positions.
    for (const role of ['header', 'footer']) for (const reference of descendants(body, role + 'Reference').filter(currentWordNode)) {
      const relationId = localAttribute(reference, 'id'), relation = relationships.get(relationId);
      if (!relation || relation.role !== role) fail(`missing or mismatched Word ${role} relationship.`);
      const target = resolveTarget(documentPart, relation.attrs.Target);
      const referenceType = localAttribute(reference, 'type');
      if (referenceType !== undefined && !['default', 'even', 'first'].includes(referenceType)) fail(`unsupported Word ${role} reference type.`);
      related.get(target).references.push({ type: referenceType || 'unspecified' });
    }
    const referenceContainers = [body];
    for (const item of related.values()) {
      if (!['header', 'footer'].includes(item.role)) continue;
      const content = part(entries, item.part), expectedRoot = item.role === 'header' ? 'hdr' : 'ftr';
      if (content.local !== expectedRoot) fail(`invalid Word ${item.role} part root in ${item.part}.`);
      referenceContainers.push(content);
      wordRecords(content, { ...item, referencedInDocument: item.references.length > 0, referenceTypes: [...new Set(item.references.map(x => x.type))] }, records);
    }
    for (const plural of ['footnotes', 'endnotes']) {
      const role = plural.slice(0, -1), parts = [...related.values()].filter(item => item.role === plural);
      if (parts.length > 1) fail(`multiple Word ${plural} parts are unsupported.`);
      const citations = new Set();
      for (const container of referenceContainers) for (const reference of descendants(container, role + 'Reference').filter(currentWordNode)) {
        const noteId = localAttribute(reference, 'id');
        if (!/^(?:0|[1-9]\d*)$/.test(noteId || '') || !Number.isSafeInteger(Number(noteId))) fail(`invalid Word ${role} reference id.`);
        citations.add(noteId);
      }
      if (!parts.length) { if (citations.size) fail(`Word ${plural} relationship is missing for cited notes.`); continue; }
      const item = parts[0], content = part(entries, item.part);
      if (content.local !== plural) fail(`invalid Word ${plural} part root in ${item.part}.`);
      const seen = new Set(), normalNotes = new Set();
      for (const note of children(content, role)) {
        const noteId = localAttribute(note, 'id'), noteType = localAttribute(note, 'type') || 'normal';
        if (!/^-?(?:0|[1-9]\d*)$/.test(noteId || '') || !Number.isSafeInteger(Number(noteId)) || String(Number(noteId)) !== noteId || seen.has(noteId)) fail(`invalid or duplicate Word ${role} id.`);
        seen.add(noteId);
        if (['separator', 'continuationSeparator', 'continuationNotice'].includes(noteType)) continue;
        if (noteType !== 'normal' || Number(noteId) < 0) fail(`unsupported Word ${role} type or id.`);
        normalNotes.add(noteId);
        wordRecords(note, { ...item, role, noteId, referencedInDocument: citations.has(noteId) }, records);
      }
      for (const noteId of citations) if (!normalNotes.has(noteId)) fail(`Word ${role} ${noteId} is cited but missing or not a normal note.`);
    }
    return records;
  }
  function resolveTarget(base, target) {
    if (target.startsWith('//') || /%[0-9a-f]{2}/i.test(target)) fail('encoded or external package relationship is unsupported.');
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes('\\') || target.includes('\0') || target.includes('#') || target.includes('?')) fail('external or invalid package relationship.');
    const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1);
    for (const piece of target.split('/')) { if (!piece || piece === '.') continue; if (piece === '..') { if (!parts.length) fail('relationship path escapes package.'); parts.pop(); } else parts.push(piece); } return parts.join('/');
  }
  function xlsx(entries) {
    const workbook = part(entries, 'xl/workbook.xml'), rels = part(entries, 'xl/_rels/workbook.xml.rels');
    if (workbook.local !== 'workbook' || rels.local !== 'Relationships') fail('invalid workbook parts.');
    const sharedPart = part(entries, 'xl/sharedStrings.xml', true);
    const shared = sharedPart ? children(sharedPart, 'si').map(spreadsheetString) : [];
    const relationships = new Map();
    for (const rel of children(rels, 'Relationship')) { if (!rel.attrs.Id || relationships.has(rel.attrs.Id)) fail('invalid or duplicate workbook relationship.'); relationships.set(rel.attrs.Id, rel.attrs); }
    const sheets = children(children(workbook, 'sheets')[0] || { children: [] }, 'sheet');
    const records = [], seenSheets = new Set();
    for (const sheet of sheets) {
      const name = sheet.attrs.name, relation = relationships.get(sheet.attrs['r:id']);
      if (!name || seenSheets.has(name) || !relation || !relation.Target || !/\/worksheet$/.test(relation.Type || '') || relation.TargetMode === 'External') fail('missing, duplicate or unsupported worksheet relationship.');
      seenSheets.add(name); const path = resolveTarget('xl/workbook.xml', relation.Target || ''), worksheet = part(entries, path);
      if (worksheet.local !== 'worksheet') fail('worksheet root is invalid.');
      const seenCells = new Set();
      for (const cell of descendants(worksheet, 'c')) {
        const address = cell.attrs.r;
        if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address || '') || seenCells.has(address)) fail('missing, duplicate or invalid cell address.');
        seenCells.add(address); const letters = address.match(/^[A-Z]+/)[0]; let column = 0; for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
        if (column > 16384 || Number(address.slice(letters.length)) > 1048576) fail('cell address exceeds Excel limits.');
        const raw = childText(cell, 'v'), type = cell.attrs.t || 'n'; let value = raw;
        if (type === 's') { if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) >= shared.length) fail('invalid shared string index.'); value = shared[Number(raw)]; }
        else if (type === 'inlineStr') value = children(cell, 'is').map(spreadsheetString).join('');
        else if (!['n', 'b', 'str', 'e', 'd'].includes(type)) fail('unsupported worksheet cell type.');
        const formulaNode = children(cell, 'f')[0], formula = formulaNode ? textOf(formulaNode) : null;
        records.push({ text: formula === null ? value : `${value}${value ? ' | ' : ''}Formula: ${formula}`, fields: { value, rawValue: raw, type, formula, formulaAttributes: formulaNode ? { ...formulaNode.attrs } : null, formulaEvaluated: false, styleIndex: cell.attrs.s || null }, locator: { kind: 'excel', part: path, sheet: name, cell: address, label: `${name}!${address}` } });
        if (records.length > LIMIT.records) fail('record limit exceeded.');
      }
    }
    return records;
  }
  async function parseOffice(bytes, extension) {
    if (!['docx', 'xlsx', 'xlsm'].includes(extension)) fail('only DOCX, XLSX and XLSM are supported; legacy DOC/XLS and encrypted files require a separate parser.');
    const entries = await readZip(bytes); part(entries, '[Content_Types].xml');
    return extension === 'docx' ? docx(entries) : xlsx(entries);
  }
  const api = { parseOffice, officeLimits: LIMIT, officeVersion: '1.1.0' };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
