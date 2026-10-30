(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ characters: 2000000, records: 50000, depth: 64, query: 500, terms: 32 });
  function fail(message) { throw new Error(message); }
  function parseText(name, text) {
    if (typeof name !== 'string' || typeof text !== 'string') fail('Provide a file name and text.');
    if (text.length > LIMITS.characters) fail('Text exceeds the 2,000,000 character limit.');
    if (text.includes('\0')) fail('Binary or null-containing text is not supported.');
    const ext = name.toLowerCase().split('.').pop();
    if (!['txt', 'md', 'csv', 'tsv', 'json'].includes(ext)) fail('Unsupported format. Use TXT, MD, CSV, TSV or JSON.');
    const records = [];
    function add(value, locator) {
      if (records.length >= LIMITS.records) fail('File exceeds the 50,000 record limit.');
      records.push({ text: value, locator });
    }
    if (ext === 'csv' || ext === 'tsv') {
      const separator = ext === 'csv' ? ',' : '\t';
      let offset = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
      let row = 1, column = 1, line = 1;
      while (offset < text.length) {
        const start = offset, startLine = line;
        let value = '';
        if (text[offset] === '"') {
          offset++;
          let closed = false;
          while (offset < text.length) {
            const ch = text[offset++];
            if (ch === '"') {
              if (text[offset] === '"') { value += '"'; offset++; }
              else { closed = true; break; }
            } else {
              value += ch;
              if (ch === '\n' || (ch === '\r' && text[offset] !== '\n')) line++;
            }
          }
          if (!closed) fail('Unclosed quoted field at row ' + row + ', column ' + column + '.');
          if (offset < text.length && text[offset] !== separator && text[offset] !== '\r' && text[offset] !== '\n') fail('Unexpected text after a quoted field.');
        } else {
          while (offset < text.length && text[offset] !== separator && text[offset] !== '\r' && text[offset] !== '\n') {
            if (text[offset] === '"') fail('Quote inside an unquoted field.');
            value += text[offset++];
          }
        }
        add(value, { type: 'delimited-cell', row, column, line: startLine, offset: start, length: offset - start, offsetUnit: 'UTF-16 code units' });
        if (text[offset] === separator) {
          column++; offset++;
          if (offset === text.length) add('', { type: 'delimited-cell', row, column, line, offset, length: 0, offsetUnit: 'UTF-16 code units' });
        } else if (offset < text.length) {
          if (text[offset++] === '\r' && text[offset] === '\n') offset++;
          row++; column = 1; line++;
        }
      }
    } else if (ext === 'json') {
      let data;
      try { data = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); }
      catch (_) { fail('Invalid JSON. Correct the source file and try again.'); }
      const stack = [{ value: data, pointer: '', depth: 0 }];
      while (stack.length) {
        const item = stack.pop();
        if (item.depth > LIMITS.depth) fail('JSON exceeds the depth limit of 64.');
        const v = item.value;
        if (v === null || typeof v !== 'object') {
          add(typeof v === 'string' ? v : JSON.stringify(v), { type: 'json-pointer', pointer: item.pointer });
        } else {
          const keys = Object.keys(v);
          if (!keys.length) add(JSON.stringify(v), { type: 'json-pointer', pointer: item.pointer });
          if (stack.length + keys.length + records.length > LIMITS.records) fail('JSON exceeds the 50,000 record limit.');
          for (let i = keys.length - 1; i >= 0; i--) {
            const key = keys[i];
            stack.push({ value: v[key], pointer: item.pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'), depth: item.depth + 1 });
          }
        }
      }
    } else {
      let offset = 0, line = 1;
      while (offset < text.length) {
        const start = offset;
        while (offset < text.length && text[offset] !== '\r' && text[offset] !== '\n') offset++;
        add(text.slice(start, offset), { type: 'text-line', line: line++, offset: start, length: offset - start, offsetUnit: 'UTF-16 code units' });
        if (offset < text.length && text[offset++] === '\r' && text[offset] === '\n') offset++;
      }
    }
    return { parserVersion: '1', records, warnings: ext === 'json' ? ['JSON pointers identify parsed values, not source lines. Duplicate object keys use the last value; retain original bytes for review.'] : [] };
  }
  function search(records, query, mode) {
    if (!Array.isArray(records) || typeof query !== 'string') fail('Provide records and a text query.');
    mode = mode || 'keyword';
    if (!['keyword', 'exact'].includes(mode)) fail('Unsupported search mode. Use keyword or exact.');
    if (query.length > LIMITS.query) fail('Query exceeds 500 characters.');
    const normalized = query.trim().toLocaleLowerCase('en-US');
    if (!normalized) return [];
    const terms = mode === 'exact' ? [normalized] : [...new Set(normalized.split(/\s+/u))];
    if (terms.length > LIMITS.terms) fail('Use at most 32 search terms.');
    if (records.length > LIMITS.records) fail('Search exceeds the 50,000 record limit.');
    const result = [];
    records.forEach((record, order) => {
      if (!record || typeof record.text !== 'string' || record.text.length > LIMITS.characters) fail('Invalid search record.');
      const value = record.text.toLocaleLowerCase('en-US');
      if (terms.every(term => value.includes(term))) {
        const score = terms.reduce((sum, term) => {
          let count = 0, position = 0;
          while ((position = value.indexOf(term, position)) !== -1) { count++; position += term.length; }
          return sum + count;
        }, 0);
        result.push({ ...record, score, _searchOrder: order });
      }
    });
    result.sort((a, b) => b.score - a.score || a._searchOrder - b._searchOrder);
    return result.map(item => { const { _searchOrder, ...record } = item; return record; });
  }
  return { parseText, search, LIMITS };
});
