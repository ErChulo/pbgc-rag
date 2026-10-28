/* Offline lexical question retrieval. This module never generates an answer. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ queryChars: 1024, terms: 32, records: 50000, recordChars: 65536, totalTextChars: 4 * 1024 * 1024, tokens: 1000000, citations: 50, structureNodes: 1500000, structureChars: 48 * 1024 * 1024 });
  const STOP = new Set(('a an the what which who whom whose when where why how is are was were am be been being do does did can could would should please tell me about of for to in on at by from with as and or this that these those it its i my we our you your').split(' '));
  const NOTICE = 'Lexical matches are source excerpts, not an answer or a legal or actuarial interpretation. No authority, priority, participant applicability, approval, or factual validity is determined. Recorded source hashes identify originals; retrieval does not authenticate them.';
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  function safeData(value, depth = 0, budget = { nodes: 0, chars: 0 }, path = new WeakSet()) {
    if (++budget.nodes > LIMITS.structureNodes || depth > 40) throw new Error('Question retrieval case structure exceeds limits.');
    if (typeof value === 'string') { budget.chars += value.length; if (budget.chars > LIMITS.structureChars) throw new Error('Question retrieval case text exceeds limits.'); return; }
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
    if (!Array.isArray(value) && !plain(value)) throw new Error('Question retrieval requires a plain JSON case.');
    if (path.has(value)) throw new Error('Question retrieval rejects cyclic case structures.');
    path.add(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe question retrieval case key.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('Question retrieval rejects case accessors.');
      if (Array.isArray(value) && key === 'length') continue;
      budget.chars += key.length; safeData(descriptor.value, depth + 1, budget, path);
    }
    path.delete(value);
  }
  function optionsLimit(options) {
    if (!plain(options)) throw new Error('Question retrieval options must be a plain object.');
    for (const key of Reflect.ownKeys(options)) {
      const descriptor = Object.getOwnPropertyDescriptor(options, key);
      if (key !== 'limit' || !Object.hasOwn(descriptor, 'value')) throw new Error('Question retrieval options accept only a data limit.');
    }
    const limit = Object.hasOwn(options, 'limit') ? options.limit : 10;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.citations) throw new Error('Question evidence limit must be 1–50.');
    return limit;
  }
  function tokens(value) {
    // Retain internal punctuation in dates/decimal literals, signs, currencies,
    // and percentages. No numerical conversion, stemming, synonym or date inference.
    return value.normalize('NFKC').toLocaleLowerCase('en-US').match(/[$€£¥]?[+\-]?[\p{L}\p{M}\p{N}]+(?:[._:/,\u2044\-][\p{L}\p{M}\p{N}]+)*%?/gu) || [];
  }
  function validateCase(c) {
    safeData(c);
    const dependencies = root.PBGC && typeof root.PBGC.validateCase === 'function' ? root.PBGC : typeof require === 'function' ? require('./artifacts.js') : null;
    if (!dependencies) throw new Error('Local case validation is required for question retrieval.');
    const validation = dependencies.validateCase(c);
    if (!validation.valid) throw new Error('Question retrieval blocked: ' + validation.errors.join(' '));
    let recordCount = 0, chars = 0;
    for (const source of c.sources) for (const record of source.records) {
      if (++recordCount > LIMITS.records || record.text.length > LIMITS.recordChars || (chars += record.text.length) > LIMITS.totalTextChars) throw new Error('Question retrieval text limit exceeded. Use a smaller case or shorter source records.');
    }
    return recordCount;
  }
  function retrieveQuestionEvidence(caseData, query, options = {}) {
    const limit = optionsLimit(options);
    if (typeof query !== 'string' || query.length > LIMITS.queryChars) throw new Error('Questions must be text of at most 1024 characters.');
    const terms = [...new Set(tokens(query).filter(term => !STOP.has(term)))];
    if (terms.length > LIMITS.terms) throw new Error('Questions may contain at most 32 meaningful terms.');
    const count = validateCase(caseData);
    const base = { status: 'insufficient-evidence', method: 'lexical-question-retrieval', modelUsed: false, query, terms, citations: [], missingTerms: terms.slice(), notice: NOTICE };
    if (!terms.length) return { ...base, notice: 'No meaningful lexical retrieval terms remain after question stopwords are removed. ' + NOTICE };
    if (!count) return { ...base, notice: 'No imported source records are available. ' + NOTICE };
    const wanted = new Set(terms), documentFrequency = new Map(terms.map(term => [term, 0])), candidates = [];
    let totalLength = 0, totalTokens = 0;
    for (const source of caseData.sources) for (const record of source.records) {
      const all = tokens(record.text);
      totalTokens += all.length;
      if (totalTokens > LIMITS.tokens) throw new Error('Question retrieval token budget exceeded. Use a smaller case.');
      const frequencies = new Map(); let length = 0;
      for (const token of all) if (!STOP.has(token)) {
        length++;
        if (wanted.has(token)) frequencies.set(token, (frequencies.get(token) || 0) + 1);
      }
      totalLength += length;
      if (!frequencies.size) continue;
      for (const term of frequencies.keys()) documentFrequency.set(term, documentFrequency.get(term) + 1);
      candidates.push({ source, record, frequencies, length });
    }
    const averageLength = Math.max(totalLength / count, 1), k1 = 1.2, b = 0.75;
    for (const candidate of candidates) {
      let score = 0;
      for (const [term, frequency] of candidate.frequencies) {
        const df = documentFrequency.get(term);
        const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
        score += idf * frequency * (k1 + 1) / (frequency + k1 * (1 - b + b * candidate.length / averageLength));
      }
      candidate.score = score;
      candidate.matchedTerms = terms.filter(term => candidate.frequencies.has(term));
    }
    candidates.sort((a, b) => Number(b.matchedTerms.length === terms.length) - Number(a.matchedTerms.length === terms.length) || b.score - a.score || b.matchedTerms.length - a.matchedTerms.length || a.record.id.localeCompare(b.record.id));
    const citations = candidates.slice(0, limit).map(({ source, record, score, matchedTerms }) => ({
      recordId: record.id, sourceId: source.id, sourceName: source.name, sourceHash: source.hash,
      excerpt: record.text, locator: JSON.parse(JSON.stringify(record.locator)), score: Math.round(score * 1000000) / 1000000, matchedTerms
    }));
    const covered = new Set(citations.flatMap(c => c.matchedTerms));
    const status = citations.some(c => c.matchedTerms.length === terms.length) ? 'evidence-found' : citations.length ? 'partial-evidence' : 'insufficient-evidence';
    const prefix = status === 'evidence-found' ? 'At least one excerpt contains every meaningful query token. This is token coverage only. ' : status === 'partial-evidence' ? 'Some query tokens occur, but no returned excerpt contains them all. Separate excerpts are not combined into a conclusion. ' : 'No source excerpt contains a meaningful query token. ';
    return { ...base, status, citations, missingTerms: terms.filter(term => !covered.has(term)), notice: prefix + NOTICE };
  }
  const exports = { retrieveQuestionEvidence, questionRetrievalLimits: LIMITS };
  Object.assign(root.PBGC = root.PBGC || {}, exports);
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
})(globalThis);
