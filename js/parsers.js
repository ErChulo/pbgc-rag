/* PBGC-RAG native parsers v1. No input is executed or inserted into a DOM. */
(function (root) {
  'use strict';
  const MAX_BYTES = 16 * 1024 * 1024;
  const MAX_RECORDS = 100000;
  const MAX_DEPTH = 64;
  const FORMATS = Object.freeze({ txt: 'text', md: 'markdown', markdown: 'markdown', csv: 'csv', tsv: 'tsv', json: 'json', xml: 'xml', html: 'html', htm: 'html', docx:'docx', xlsx:'xlsx', xlsm:'xlsm', pdf:'pdf', sqlite:'sqlite', sqlite3:'sqlite', db:'sqlite' });
  const VERSION = '1.1.0';
  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(text);
  }
  function decode(bytes) {
    let encoding = 'utf-8';
    if (bytes[0] === 255 && bytes[1] === 254) encoding = 'utf-16le';
    if (bytes[0] === 254 && bytes[1] === 255) encoding = 'utf-16be';
    const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('Binary or NUL-containing text is not supported.');
    return { text, encoding };
  }
  function lineFinder(text) {
    const starts = [0]; const breaks = /\r\n|\r|\n/g; let match;
    while ((match = breaks.exec(text))) starts.push(match.index + match[0].length);
    return offset => { let low = 0, high = starts.length; while (low + 1 < high) { const mid = (low + high) >>> 1; if (starts[mid] <= offset) low = mid; else high = mid; } return low + 1; };
  }
  function lines(text) {
    const rows = []; const re = /([^\r\n]*)(\r\n|\r|\n|$)/g; let match, line = 1;
    while ((match = re.exec(text)) && match[0]) {
      if (match[1].trim()) rows.push({ text: match[1], locator: { kind: 'text', label: `Line ${line}`, line, offset: match.index, length: match[1].length, offsetUnit: 'UTF-16 code unit in decoded source' } });
      line++;
    }
    return Array.from(rows);
  }
  function delimited(text, delimiter) {
    const lineAt = lineFinder(text);
    const rows = []; let i = 0, row = 1, column = 1, rowStart = 0, cells = [], cellMeta = [];
    // RFC 4180 quoted cells; offsets address the original decoded source, including quotes.
    while (i < text.length) {
      const start = i; let value = '';
      if (text[i] === '"') {
        i++; let closed = false;
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { value += '"'; i += 2; }
            else { i++; closed = true; break; }
          } else value += text[i++];
        }
        if (!closed) throw new Error(`Unclosed quoted cell at row ${row}, column ${column}.`);
        if (i < text.length && ![delimiter, '\r', '\n'].includes(text[i])) throw new Error(`Unexpected text after quoted cell at row ${row}, column ${column}.`);
      } else {
        while (i < text.length && ![delimiter, '\r', '\n'].includes(text[i])) {
          if (text[i] === '"' && delimiter === ',') throw new Error(`Quote in unquoted cell at row ${row}, column ${column}.`);
          value += text[i++];
        }
      }
      cells.push(value); cellMeta.push({ column, offset: start, length: i - start });
      if (text[i] === delimiter) { i++; column++; if (i < text.length) continue; cells.push(''); cellMeta.push({ column, offset: i, length: 0 }); }
      rows.push({ text: cells.join(' | '), fields: { cells }, locator: { kind: 'delimited', label: `Row ${row}, columns 1–${cells.length}`, row, line: lineAt(rowStart), columns: cellMeta, offset: rowStart, length: i - rowStart, offsetUnit: 'UTF-16 code unit in decoded source' } });
      if (rows.length > MAX_RECORDS) throw new Error('Record limit exceeded. Split the source file.');
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
      else if (text[i] === '\r' || text[i] === '\n') i++;
      cells = []; cellMeta = []; column = 1; row++; rowStart = i;
    }
    return rows;
  }
  function jsonRecords(text) {
    const value = JSON.parse(text); const rows = [];
    function visit(item, pointer, depth) {
      if (depth > MAX_DEPTH) throw new Error('JSON nesting exceeds the safe depth limit.');
      if (rows.length >= MAX_RECORDS) throw new Error('Record limit exceeded. Split the source file.');
      if (item !== null && typeof item === 'object') {
        const entries = Object.entries(item);
        if (!entries.length) rows.push({ text: JSON.stringify(item), locator: { kind: 'json', label: pointer || '/', pointer } });
        for (const [key, child] of entries) visit(child, pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'), depth + 1);
      } else rows.push({ text: String(item), fields: { value: item }, locator: { kind: 'json', label: pointer || '/', pointer } });
    }
    visit(value, '', 0); return rows;
  }
  function entities(text, xml) {
    if (xml && /&(?!(?:#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);)/i.test(text)) throw new Error('Malformed XML entity.');
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (raw, name) => {
      const basic = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
      if (Object.hasOwn(basic, name) && (!xml || name !== 'nbsp')) return basic[name];
      if (name[0] === '#') {
        const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        if (number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)) return String.fromCodePoint(number);
      }
      if (xml) throw new Error('XML contains an unsupported entity. DTDs and external entities are prohibited.');
      return raw;
    });
  }
  function markupRecords(text, xml) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text) && xml) throw new Error('XML DTDs and external entities are prohibited.');
    const lineAt = lineFinder(text);
    const rows = [], stack = [], counts = [Object.create(null)]; let cursor = 0, rootCount = 0;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    const suppressed = new Set(['script', 'style', 'noscript', 'template']);
    function add(raw, offset, cdata) {
      if (!raw.trim() || (!xml && stack.some(x => suppressed.has(x.name)))) return;
      if (xml && !stack.length) throw new Error('XML text must be inside the root element.');
      const value = cdata ? raw : entities(raw, xml);
      rows.push({ text: value, locator: { kind: xml ? 'xml' : 'html', label: `${stack.map(x => x.path).join('') || '/'} · offset ${offset}`, path: stack.map(x => x.path).join('') || '/', offset, length: raw.length, offsetUnit: 'UTF-16 code unit in decoded source', line: lineAt(offset) } });
      if (rows.length > MAX_RECORDS) throw new Error('Record limit exceeded. Split the source file.');
    }
    // Tokenize only. Never load resources, invoke DOM parsing, or interpret script content.
    const token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/?[A-Za-z_][\w:.-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g;
    let match;
    while ((match = token.exec(text))) {
      const rawText = text.slice(cursor, match.index);
      if (xml && rawText.includes('<')) throw new Error('Malformed XML markup.');
      add(rawText, cursor, false); const tag = match[0]; cursor = token.lastIndex;
      if (tag.startsWith('<![CDATA[')) { add(tag.slice(9, -3), match.index + 9, true); continue; }
      if (tag.startsWith('<!') || tag.startsWith('<?')) continue;
      const nameMatch = /^<\/?([\w:.-]+)/.exec(tag); let name = nameMatch[1]; if (!xml) name = name.toLowerCase();
      if (xml) {
        const attributePart = tag.slice(nameMatch[0].length).replace(/\/?>$/, '');
        const validAttributes = /^(?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*$/;
        if (tag.startsWith('</') ? !/^\s*$/.test(attributePart) : !validAttributes.test(attributePart)) throw new Error('Malformed XML attributes.');
        entities(attributePart, true);
        const attrs = [...attributePart.matchAll(/([A-Za-z_][\w:.-]*)\s*=/g)].map(x => x[1]);
        if (new Set(attrs).size !== attrs.length) throw new Error('Duplicate XML attribute.');
      }
      if (tag.startsWith('</')) {
        if (xml && (stack.length === 0 || stack[stack.length - 1].name !== name)) throw new Error('XML closing element does not match its opening element.');
        const at = stack.map(x => x.name).lastIndexOf(name);
        if (at >= 0) { stack.splice(at); counts.splice(at + 1); }
      } else {
        if (xml && !stack.length && ++rootCount > 1) throw new Error('XML must have one root element.');
        const siblings = counts[counts.length - 1]; siblings[name] = (siblings[name] || 0) + 1;
        if (!tag.endsWith('/>') && (xml || !voidTags.has(name))) {
          stack.push({ name, path: `/${name}[${siblings[name]}]` }); counts.push(Object.create(null));
          if (stack.length > MAX_DEPTH) throw new Error('Markup nesting exceeds the safe depth limit.');
        }
      }
    }
    const tail = text.slice(cursor);
    if (xml && tail.includes('<')) throw new Error('Malformed XML markup.');
    add(tail, cursor, false);
    if (xml && (stack.length || rootCount !== 1)) throw new Error('XML must have a closed root element.');
    return rows;
  }
  async function parseFile(file) {
    if (!file || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function') throw new Error('Select a local file.');
    const extension = file.name.toLowerCase().split('.').pop(); const format = FORMATS[extension];
    if (!format) throw new Error(`Unsupported format: ${extension}. Legacy DOC/XLS and unknown formats are not supported. Original file is unchanged.`);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_BYTES) throw new Error('File exceeds the 16 MiB import limit.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size || bytes.byteLength > MAX_BYTES) throw new Error('File size changed or exceeds the import limit.');
    let text, encoding;
    const binary=['docx','xlsx','xlsm','pdf','sqlite'].includes(format);
    if(!binary)({text,encoding}=decode(bytes));else encoding='binary';
    const hash = Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
    const id = 'src-' + hash;
    let records;
    if(['docx','xlsx','xlsm'].includes(format)){if(!root.PBGC?.parseOffice)throw Error('Office parser is unavailable.');records=await root.PBGC.parseOffice(bytes,extension);}
    else if(format==='pdf'){if(!root.PBGC?.parsePDF && !root.PBGC?.parsePDFAdvanced)throw Error('PDF parser is unavailable.');records=await (root.PBGC.parsePDFAdvanced || root.PBGC.parsePDF)(bytes);}
    else if(format==='sqlite'){if(!root.PBGC?.parseSQLite)throw Error('SQLite parser is unavailable.');records=await root.PBGC.parseSQLite(bytes);}
    else if (format === 'csv' || format === 'tsv') records = delimited(text, format === 'csv' ? ',' : '\t');
    else if (format === 'json') records = jsonRecords(text);
    else if (format === 'xml' || format === 'html') records = markupRecords(text, format === 'xml');
    else records = lines(text);
    if (records.length > MAX_RECORDS) throw new Error('Record limit exceeded. Split the source file.');
    let extractedChars=0;
    for(const record of records){
      if(typeof record.text!=='string'||record.text.length>2*1024*1024)throw new Error('Parsed record exceeds the 2 MiB text limit. Split the source content.');
      extractedChars+=record.text.length;
      if(extractedChars>32*1024*1024)throw new Error('Extracted source text exceeds the 32 MiB limit. Split the source content.');
    }
    records = records.map((record, index) => ({ ...record, id: `${id}:${index + 1}`, sourceId: id }));
    return { id, name: file.name, hash, format, size: bytes.byteLength, parserVersion: ['docx','xlsx','xlsm'].includes(format) ? (root.PBGC.officeVersion || VERSION) : (format==='sqlite' ? (root.PBGC.SQLITE_PARSER_VERSION || VERSION) : format==='pdf' && root.PBGC.parsePDFAdvanced ? `pdfjs-${root.PBGC_PDFJS?.version || 'unavailable'}/bounded-${root.PBGC.PDF_ADVANCED_PARSER_VERSION || '1.0.0'}` : VERSION), encoding, records, originalBase64: bytesToBase64(bytes) };
  }
  const api = { parseFile, parserRegistry: Object.freeze({ version: VERSION, formats: FORMATS, maxBytes: MAX_BYTES, maxRecords: MAX_RECORDS, maxDepth: MAX_DEPTH, maxRecordChars: 2*1024*1024, maxTextChars: 32*1024*1024 }) };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
