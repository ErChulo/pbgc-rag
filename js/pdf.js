/* Bounded PDF text subset v1. No OCR, inferred positions, scripts, or resources. */
(function (root) {
  'use strict';
  const MAX_FILE = 16 * 1024 * 1024, MAX_STREAM = 8 * 1024 * 1024, MAX_TOTAL_STREAM = 32 * 1024 * 1024;
  const limits = Object.freeze({ fileBytes: MAX_FILE, streamBytes: MAX_STREAM, totalStreamBytes: MAX_TOTAL_STREAM, objects: 20000, pages: 1000, records: 100000, stringBytes: 65536, nesting: 32 });
  const bad = message => { throw new Error('PDF: ' + message); };
  const binary = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192)); return out; };
  const isName = (v, name) => v?.kind === 'name' && v.value === name;
  const isRef = value => value?.kind === 'ref';
  class Reader {
    constructor(text, position = 0) { this.text = text; this.i = position; }
    skip() { while (this.i < this.text.length) { if (/[\0\t\n\f\r ]/.test(this.text[this.i])) this.i++; else if (this.text[this.i] === '%') { while (this.i < this.text.length && !/[\r\n]/.test(this.text[this.i])) this.i++; } else break; } }
    word() { this.skip(); const start = this.i; while (this.i < this.text.length && !/[\0\t\n\f\r ()<>\[\]{}/%]/.test(this.text[this.i])) this.i++; if (start === this.i) bad('Expected a token.'); return this.text.slice(start, this.i); }
    take(word) { if (this.word() !== word) bad('Expected ' + word + '.'); }
    value(depth = 0) {
      if (depth > limits.nesting) bad('Object nesting limit exceeded.');
      this.skip(); const start = this.i, c = this.text[this.i];
      if (this.text.startsWith('<<', this.i)) {
        this.i += 2; const result = Object.create(null); let count = 0;
        while (true) {
          this.skip(); if (this.text.startsWith('>>', this.i)) { this.i += 2; return result; }
          const key = this.value(depth + 1); if (key?.kind !== 'name') bad('Dictionary keys must be names.');
          if (Object.hasOwn(result, key.value)) bad('Duplicate dictionary key.');
          if (++count > 4096) bad('Dictionary limit exceeded.'); result[key.value] = this.value(depth + 1);
        }
      }
      if (c === '[') {
        this.i++; const result = [];
        while (true) { this.skip(); if (this.text[this.i] === ']') { this.i++; return result; } if (result.length >= 8192) bad('Array limit exceeded.'); result.push(this.value(depth + 1)); }
      }
      if (c === '/') {
        this.i++; let value = '';
        while (this.i < this.text.length && !/[\0\t\n\f\r ()<>\[\]{}/%]/.test(this.text[this.i])) {
          if (this.text[this.i] === '#') { const hex = this.text.slice(this.i + 1, this.i + 3); if (!/^[0-9a-f]{2}$/i.test(hex)) bad('Malformed name escape.'); value += String.fromCharCode(parseInt(hex, 16)); this.i += 3; }
          else value += this.text[this.i++];
          if (value.length > 256) bad('Name limit exceeded.');
        }
        return { kind: 'name', value };
      }
      if (c === '(') {
        this.i++; const bytes = []; let nesting = 1;
        while (this.i < this.text.length) {
          let ch = this.text[this.i++];
          if (ch === '\\') {
            if (this.i >= this.text.length) bad('Incomplete string escape.');
            ch = this.text[this.i++];
            if (ch === '\r' || ch === '\n') { if (ch === '\r' && this.text[this.i] === '\n') this.i++; continue; }
            if (/[0-7]/.test(ch)) { let octal = ch; for (let j = 0; j < 2 && /[0-7]/.test(this.text[this.i] || 'x'); j++) octal += this.text[this.i++]; bytes.push(parseInt(octal, 8) & 255); }
            else bytes.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 })[ch] ?? ch.charCodeAt(0));
          } else if (ch === '(') { if (++nesting > limits.nesting) bad('String nesting limit exceeded.'); bytes.push(40); }
          else if (ch === ')') { if (--nesting === 0) return { kind: 'string', bytes: new Uint8Array(bytes), offset: start }; bytes.push(41); }
          else { if (ch === '\r') { if (this.text[this.i] === '\n') this.i++; ch = '\n'; } bytes.push(ch.charCodeAt(0)); }
          if (bytes.length > limits.stringBytes) bad('String byte limit exceeded.');
        }
        bad('Unclosed string.');
      }
      if (c === '<') {
        this.i++; let hex = '';
        while (this.i < this.text.length && this.text[this.i] !== '>') { const ch = this.text[this.i++]; if (/\s/.test(ch)) continue; if (!/[0-9a-f]/i.test(ch)) bad('Invalid hex string.'); hex += ch; if (hex.length > limits.stringBytes * 2) bad('String byte limit exceeded.'); }
        if (this.text[this.i++] !== '>') bad('Unclosed hex string.'); if (hex.length % 2) hex += '0';
        return { kind: 'string', bytes: new Uint8Array(hex.match(/../g)?.map(h => parseInt(h, 16)) || []), offset: start };
      }
      const word = this.word();
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
        const number = Number(word); if (!Number.isFinite(number)) bad('Invalid number.');
        const reference = /^\s+(\d+)\s+R\b/.exec(this.text.slice(this.i));
        if (reference && Number.isSafeInteger(number) && number >= 0) { this.i += reference[0].length; return { kind: 'ref', id: number, generation: Number(reference[1]) }; }
        return number;
      }
      if (word === 'true') return true; if (word === 'false') return false; if (word === 'null') return null;
      return { kind: 'operator', value: word, offset: start };
    }
  }
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') bad('This browser lacks local FlateDecode support.');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(); const chunks = []; let count = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; count += part.value.length; if (count > MAX_STREAM) { await reader.cancel(); bad('Decompressed stream limit exceeded.'); } chunks.push(part.value); }
    } catch (error) { if (String(error.message).startsWith('PDF:')) throw error; bad('Invalid FlateDecode stream.'); }
    const out = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; } return out;
  }
  async function parsePDF(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_FILE) bad('Input must be bytes within the 16 MiB limit.');
    const text = binary(bytes); if (!/^%PDF-1\.[0-7](?:\r\n|\r|\n)/.test(text)) bad('Only conventional PDF 1.0–1.7 files are supported.');
    const ending = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text.slice(-1024)); if (!ending) bad('Missing final cross-reference offset.');
    const offset = Number(ending[1]); if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bytes.length) bad('Invalid cross-reference offset.');
    const reader = new Reader(text, offset); if (reader.word() !== 'xref') bad('Cross-reference streams are unsupported. Use a conventional text PDF.');
    const xref = new Map(); let entries = 0;
    while (true) {
      reader.skip(); if (text.startsWith('trailer', reader.i)) { reader.take('trailer'); break; }
      const first = Number(reader.word()), count = Number(reader.word());
      if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(count) || count < 0 || (entries += count) > limits.objects) bad('Cross-reference object limit exceeded.');
      for (let j = 0; j < count; j++) {
        const location = Number(reader.word()), generation = Number(reader.word()), status = reader.word();
        if (!Number.isSafeInteger(location) || location < 0 || !Number.isSafeInteger(generation) || generation < 0 || !['n', 'f'].includes(status)) bad('Malformed cross-reference entry.');
        if (status === 'n') { const key = `${first + j} ${generation}`; if (location >= offset || xref.has(key)) bad('Invalid or duplicate object offset.'); xref.set(key, location); }
      }
    }
    const trailer = reader.value();
    if (!trailer || Array.isArray(trailer) || trailer.kind || !isRef(trailer.Root)) bad('Invalid trailer root.');
    if (trailer.Encrypt !== undefined) bad('Encrypted PDFs are unsupported.');
    if (trailer.Prev !== undefined || trailer.XRefStm !== undefined) bad('Incremental or hybrid cross-reference files are unsupported.');
    const cache = new Map(), objectRanges = []; let decodedBytes = 0;
    function object(ref) {
      if (!isRef(ref)) bad('Expected an indirect object reference.'); const key = `${ref.id} ${ref.generation}`;
      if (cache.has(key)) return cache.get(key);
      if (!xref.has(key)) bad('Missing referenced object.');
      const r = new Reader(text, xref.get(key));
      if (r.word() !== String(ref.id) || r.word() !== String(ref.generation)) bad('Object header differs from cross-reference table.'); r.take('obj');
      const value = r.value(); r.skip(); let stream = null;
      if (text.startsWith('stream', r.i)) {
        r.take('stream'); if (text[r.i] === '\r') { r.i++; if (text[r.i] === '\n') r.i++; } else if (text[r.i] === '\n') r.i++; else bad('Malformed stream line ending.');
        if (!value || !Number.isSafeInteger(value.Length) || value.Length < 0 || value.Length > MAX_STREAM) bad('Stream needs a direct length within 8 MiB.');
        const end = r.i + value.Length; if (end > offset) bad('Stream length extends beyond object area.');
        stream = bytes.subarray(r.i, end); r.i = end; r.take('endstream');
      }
      r.take('endobj');
      const start = xref.get(key), end = r.i;
      if (objectRanges.some(range => start < range.end && end > range.start)) bad('Referenced object boundaries overlap.');
      objectRanges.push({ start, end });
      const result = { value, stream }; cache.set(key, result); return result;
    }
    const resolve = value => isRef(value) ? object(value).value : value;
    async function content(ref) {
      const obj = object(ref), dict = obj.value; if (!obj.stream) bad('Page content has no stream.');
      if (dict.DecodeParms !== undefined && dict.DecodeParms !== null) bad('Stream decode parameters are unsupported.');
      let filters = dict.Filter === undefined ? [] : Array.isArray(dict.Filter) ? dict.Filter : [dict.Filter];
      if (filters.length > 1 || filters.some(f => !isName(f, 'FlateDecode'))) bad('Only raw and FlateDecode text streams are supported.');
      const output = filters.length ? await inflate(obj.stream) : obj.stream;
      if (output.length > MAX_STREAM || (decodedBytes += output.length) > MAX_TOTAL_STREAM) bad('Content stream memory limit exceeded.');
      return binary(output);
    }
    const catalog = object(trailer.Root).value; if (!isName(catalog.Type, 'Catalog')) bad('Trailer root is not a catalog.');
    const pages = [], seen = new Set();
    function walk(ref, inherited, depth) {
      if (depth > limits.nesting) bad('Page tree nesting limit exceeded.');
      if (!isRef(ref)) bad('Page tree entries must be indirect references.');
      const key = `${ref.id} ${ref.generation}`; if (seen.has(key)) bad('Cyclic or repeated page tree node.'); seen.add(key);
      const page = object(ref).value, resources = page.Resources ?? inherited;
      if (isName(page.Type, 'Pages')) {
        if (!Array.isArray(page.Kids) || page.Kids.length > limits.pages) bad('Invalid page tree children.'); for (const kid of page.Kids) walk(kid, resources, depth + 1);
      } else if (isName(page.Type, 'Page')) { if (pages.length >= limits.pages) bad('Page limit exceeded.'); pages.push({ page, resources }); }
      else bad('Unsupported page tree object.');
    }
    walk(catalog.Pages, undefined, 0); if (!pages.length) bad('PDF contains no pages.');
    const standardFonts = /^(?:Helvetica(?:-Bold|-Oblique|-BoldOblique)?|Times-(?:Roman|Bold|Italic|BoldItalic)|Courier(?:-Bold|-Oblique|-BoldOblique)?)$/;
    const output = [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const { page, resources: resourceValue } = pages[pageIndex], resources = resolve(resourceValue);
      if (!resources || typeof resources !== 'object') bad('Page resources are missing.');
      const fonts = resolve(resources.Font) || Object.create(null), fontMap = new Map();
      for (const [name, value] of Object.entries(fonts)) {
        const font = resolve(value);
        if (!font || !isName(font.Subtype, 'Type1') || !standardFonts.test(font.BaseFont?.value || '') || font.ToUnicode !== undefined || font.CharProcs !== undefined || font.FontDescriptor !== undefined) bad('Unsupported font or character map. Standard Type1 fonts without CMaps are required.');
        const encoding = font.Encoding;
        if (encoding !== undefined && !isName(encoding, 'WinAnsiEncoding') && !isName(encoding, 'StandardEncoding')) bad('Custom font encoding is unsupported.');
        fontMap.set(name, isName(encoding, 'WinAnsiEncoding') ? 'windows-1252' : 'ascii');
      }
      const contents = Array.isArray(page.Contents) ? page.Contents : page.Contents ? [page.Contents] : [];
      const pageStart = output.length; let font = null, inText = false;
      for (const ref of contents) {
        const source = await content(ref), r = new Reader(source), operands = [];
        while (true) {
          r.skip(); if (r.i >= source.length) break; const value = r.value();
          if (value?.kind !== 'operator') { if (operands.length >= 1024) bad('Content operand limit exceeded.'); operands.push(value); continue; }
          const op = value.value;
          if (op === 'BT') { if (inText) bad('Nested text object.'); inText = true; }
          else if (op === 'ET') { if (!inText) bad('Text object close without open.'); inText = false; }
          else if (op === 'Tf') { if (!inText || operands.length !== 2 || operands[0]?.kind !== 'name' || typeof operands[1] !== 'number' || !fontMap.has(operands[0].value)) bad('Invalid or unsupported text font.'); font = fontMap.get(operands[0].value); }
          else if (['Tj', 'TJ', "'", '"'].includes(op)) {
            if (!inText || !font) bad('Text display requires a supported font in a text object.');
            let parts;
            if (op === 'TJ') { if (operands.length !== 1 || !Array.isArray(operands[0])) bad('Malformed TJ operands.'); parts = operands[0]; if (parts.some(p => typeof p !== 'number' && p?.kind !== 'string')) bad('Unsupported TJ operand.'); }
            else { const expected = op === '"' ? 3 : 1; if (operands.length !== expected || operands[expected - 1]?.kind !== 'string' || (op === '"' && operands.slice(0, 2).some(x => typeof x !== 'number'))) bad('Malformed text display operands.'); parts = [operands[expected - 1]]; }
            const strings = parts.filter(p => p?.kind === 'string'), segments = [];
            for (const part of strings) {
              if ([...part.bytes].some(b => (b < 32 && ![9, 10, 13].includes(b)) || b === 127 || (font === 'ascii' && b > 126) || (font !== 'ascii' && [129, 141, 143, 144, 157].includes(b)))) bad('Unsupported character code. A font CMap or OCR may be required.');
              segments.push(font === 'ascii' ? binary(part.bytes) : new TextDecoder('windows-1252').decode(part.bytes));
            }
            const extracted = segments.join('');
            if (extracted.length > 65536) bad('Text record limit exceeded.');
            if (extracted.trim()) {
              if (output.length >= limits.records) bad('Text record count limit exceeded.');
              output.push({ text: extracted, fields: { textOperator: op, fragments: segments, spacingAdjustments: parts.filter(p => typeof p === 'number'), extraction: 'Encoded text runs; visual order and spacing are not inferred.' }, locator: { kind: 'pdf', label: `Page ${pageIndex + 1} · content ${ref.id} ${ref.generation} · operand ${strings[0]?.offset ?? value.offset}`, page: pageIndex + 1, contentObject: `${ref.id} ${ref.generation}`, operandOffset: strings[0]?.offset ?? value.offset, offsetUnit: 'byte offset in decoded content stream', boundingBox: null } });
            }
          } else if (['Do', 'BI', 'ID', 'EI', 'BDC', 'MP', 'DP', 'sh', 'gs'].includes(op)) bad('Images, form XObjects, marked replacement text, and shading are unsupported. OCR or an advanced local parser is required.');
          else if (!['q', 'Q', 'cm', 'w', 'J', 'j', 'M', 'd', 'ri', 'i', 'm', 'l', 'c', 'v', 'y', 'h', 're', 'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n', 'W', 'W*', 'CS', 'cs', 'SC', 'SCN', 'sc', 'scn', 'G', 'g', 'RG', 'rg', 'K', 'k', 'Tc', 'Tw', 'Tz', 'TL', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'BMC', 'EMC'].includes(op)) bad('Unsupported content operator: ' + op + '.');
          operands.length = 0;
        }
        if (operands.length) bad('Content ends with incomplete operands.');
      }
      if (inText) bad('Unclosed page text object.');
      if (output.length === pageStart) bad('Page has no supported extractable text. Blank and scanned pages require an advanced local parser or OCR.');
    }
    return output;
  }
  const api = { parsePDF, pdfParserVersion: '1.0.0-text-subset', pdfLimits: limits };
  Object.assign(root.PBGC = root.PBGC || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
