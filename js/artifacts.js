(function (root) {
  'use strict';
  const VERSION = 1;
  const LIMITS = Object.freeze({ packageChars: 48 * 1024 * 1024, sources: 1000, records: 100000, sourceBytes: 16 * 1024 * 1024, textChars: 2 * 1024 * 1024, rules: 1000 });
  const OFFICIAL_BLOCKERS = Object.freeze([
    'The approved versioned data_dictionary_complete.xlsm is not validated.',
    'Authoritative BSRS syntax and its validator are not supplied.',
    'Approved official templates and field mappings are not validated.',
    'Official actuarial specifications and independent numerical acceptance are not validated.',
    'Authorized human approval for official release is required.'
  ]);
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
  const str = (x, max = 1000) => typeof x === 'string' && x.length > 0 && x.length <= max;
  const isoDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x.slice(0, 10);
  function safeTree(x, depth = 0, budget = { n: 0 }) {
    if (++budget.n > 1500000 || depth > 40) throw new Error('Case structure exceeds limits.');
    if (x === null || typeof x === 'boolean' || typeof x === 'string') return;
    if (typeof x === 'number' && Number.isFinite(x)) return;
    if (!Array.isArray(x) && !plain(x)) throw new Error('Case must contain JSON data only.');
    for (const key of Reflect.ownKeys(x)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe object key.');
      const descriptor = Object.getOwnPropertyDescriptor(x, key);
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('Case accessors are not accepted.');
      if (Array.isArray(x) && key === 'length') continue;
      safeTree(descriptor.value, depth + 1, budget);
    }
  }
  function claimScreening(c) {
    if (c.claims === undefined) return { schemaVersion: 1, caseId: c.id, assessedClaims: 0, conflicts: [], status: 'not-screened', interpretation: 'No structured claims are supplied. No contradiction screening was performed. This does not establish correctness or official acceptance.' };
    const ontology = root.PBGC && typeof root.PBGC.detectConflicts === 'function' ? root.PBGC : typeof require === 'function' ? require('./ontology.js') : null;
    if (!ontology || typeof ontology.detectConflicts !== 'function') throw new Error('Claim validation is unavailable. Load the local ontology module.');
    const screening = ontology.detectConflicts(c, c.claims);
    return { ...screening, status: screening.conflicts.length ? 'unresolved' : 'no-conflicts-flagged' };
  }
  function bytesFromBase64(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(LIMITS.sourceBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid or oversized original source bytes.');
    const raw = typeof atob === 'function' ? atob(value) : Buffer.from(value, 'base64').toString('binary');
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  async function digest(bytes) {
    const c = root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!c || !c.subtle) throw new Error('SHA-256 is unavailable. Package operations are blocked.');
    return Array.from(new Uint8Array(await c.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
  }
  function validateCase(c) {
    const errors = [], warnings = [];
    try { safeTree(c); } catch (e) { return { valid: false, errors: [e.message], warnings }; }
    if (!plain(c)) return { valid: false, errors: ['Case must be an object.'], warnings };
    if (c.schemaVersion !== VERSION) errors.push('Unsupported case schema version.');
    if (!str(c.id, 200) || !str(c.name, 200) || !isoDate(c.createdAt)) errors.push('Case id, name, or creation date is invalid.');
    if (!Array.isArray(c.sources) || c.sources.length > LIMITS.sources) errors.push('Sources are missing or exceed limits.');
    if (!Array.isArray(c.rules) || c.rules.length > LIMITS.rules) errors.push('Rules are missing or exceed limits.');
    if (!Array.isArray(c.calculations) || c.calculations.length > 10000) errors.push('Calculations are missing or exceed limits.');
    if (!plain(c.graph) || !Array.isArray(c.graph.nodes) || !Array.isArray(c.graph.edges) || c.graph.nodes.length > 10000 || c.graph.edges.length > 50000) errors.push('Graph is missing or exceeds limits.');
    const sourceIds = new Set(), recordIds = new Set(), recordSource = new Map(); let count = 0;
    for (const s of Array.isArray(c.sources) ? c.sources.slice(0, LIMITS.sources) : []) {
      if (!plain(s)) { errors.push('Source must be an object.'); continue; }
      if (!/^[a-f0-9]{64}$/.test(s.hash) || s.id !== 'src-' + s.hash || sourceIds.has(s.id)) errors.push('Source identity or hash is invalid or duplicated.');
      sourceIds.add(s.id);
      if (s.caseId !== undefined && s.caseId !== c.id) errors.push('Source belongs to a different case.');
      if (!str(s.name, 500) || !str(s.format, 30) || !Number.isSafeInteger(s.size) || s.size < 0 || s.size > LIMITS.sourceBytes) errors.push('Source metadata is invalid.');
      try { if (bytesFromBase64(s.originalBase64).length !== s.size) errors.push('Original source size does not match metadata.'); } catch (e) { errors.push(e.message); }
      if (!Array.isArray(s.records)) { errors.push('Source records are missing.'); continue; }
      count += s.records.length;
      if (count > LIMITS.records) { errors.push('Record count exceeds limits.'); break; }
      for (const r of s.records) {
        if (!plain(r) || !str(r.id, 300) || recordIds.has(r.id) || r.sourceId !== s.id || typeof r.text !== 'string' || r.text.length > LIMITS.textChars || !plain(r.locator) || !str(r.locator.kind, 50) || !str(r.locator.label, 1000)) { errors.push('Record identity, text, or source locator is invalid.'); continue; }
        recordIds.add(r.id); recordSource.set(r.id, s.id);
        if (r.caseId !== undefined && r.caseId !== c.id) errors.push('Source record belongs to a different case.');
      }
    }
    if (plain(c.graph) && c.graph.caseId !== undefined && c.graph.caseId !== c.id) errors.push('Graph case identity does not match this case.');
    const nodes = new Set(), edgeIds = new Set();
    for (const n of c.graph && Array.isArray(c.graph.nodes) ? c.graph.nodes : []) {
      if (!plain(n) || !str(n.id, 300) || nodes.has(n.id)) errors.push('Graph node identity is invalid or duplicated.');
      else nodes.add(n.id);
      if (plain(n) && n.caseId !== undefined && n.caseId !== c.id) errors.push('Graph node belongs to a different case.');
      if (plain(n) && n.sourceId !== undefined && !sourceIds.has(n.sourceId)) errors.push('Graph node source evidence is outside this case.');
      if (plain(n) && n.recordId !== undefined && (!recordIds.has(n.recordId) || (n.sourceId !== undefined && recordSource.get(n.recordId) !== n.sourceId))) errors.push('Graph node record evidence is outside its case source.');
    }
    for (const e of c.graph && Array.isArray(c.graph.edges) ? c.graph.edges : []) {
      if (!plain(e) || !str(e.id, 300) || edgeIds.has(e.id) || !nodes.has(e.from) || !nodes.has(e.to) || !str(e.type, 100) || !str(e.sourceId, 300) || !sourceIds.has(e.sourceId)) errors.push('Graph edge lacks a unique id, valid endpoints, type, or case source evidence.');
      if (plain(e)) edgeIds.add(e.id);
      if (plain(e) && e.caseId !== undefined && e.caseId !== c.id) errors.push('Graph edge belongs to a different case.');
      if (plain(e) && (!str(e.recordId, 300) || !recordIds.has(e.recordId) || recordSource.get(e.recordId) !== e.sourceId)) errors.push('Graph edge record evidence is outside its case source.');
      if (e && ((e.validFrom !== undefined && !isoDate(e.validFrom)) || (e.validTo !== undefined && !isoDate(e.validTo)) || (e.validFrom && e.validTo && e.validFrom > e.validTo))) errors.push('Graph edge validity period is invalid.');
    }
    const ruleIds = new Set();
    for (const r of Array.isArray(c.rules) ? c.rules : []) {
      if (!plain(r) || !str(r.id, 200) || ruleIds.has(r.id) || !Number.isSafeInteger(r.version) || r.version < 1 || !['proposed', 'approved', 'rejected'].includes(r.status) || !str(r.title, 300) || !isoDate(r.effectiveDate) || !Array.isArray(r.sourceRecordIds) || !r.sourceRecordIds.length || new Set(r.sourceRecordIds).size !== r.sourceRecordIds.length || r.sourceRecordIds.some(id => !recordIds.has(id))) errors.push('Rule metadata or case evidence is invalid.');
      else ruleIds.add(r.id);
      if (r && r.status === 'approved' && (!plain(r.approval) || !str(r.approval.reviewer, 200) || !str(r.approval.statement, 2000) || !isoDate(r.approval.approvedAt) || r.approval.confirmedByHuman !== true)) errors.push('Approved rule lacks explicit human approval metadata.');
    }
    for (const x of Array.isArray(c.calculations) ? c.calculations : []) {
      if (!plain(x) || !str(x.ruleId, 200) || !ruleIds.has(x.ruleId) || x.synthetic !== true || x.official !== false) { errors.push('Calculation is unsupported or lacks a case rule.'); continue; }
      const rule = c.rules.find(r => r.id === x.ruleId);
      if (rule.status !== 'approved' || rule.synthetic !== true || rule.formula !== 'synthetic-accrual-v1' || x.ruleVersion !== rule.version) errors.push('Calculation rule is not approved or its version has changed.');
      try {
        const expected = syntheticAmounts(x.inputs);
        if (x.annualBenefitCents !== expected.annualBenefitCents || x.monthlyBenefitCents !== expected.monthlyBenefitCents || JSON.stringify(x.trace) !== JSON.stringify(expected.trace)) errors.push('Calculation failed exact replay validation.');
      } catch { errors.push('Calculation inputs are invalid.'); }
    }
    if (c.claims !== undefined && errors.length === 0) {
      try { claimScreening(c); } catch (e) { errors.push(e.message); }
    }
    if (!sourceIds.size) warnings.push('No source evidence is imported.');
    warnings.push('Schema validation does not verify source content, interpretations, or official output validity. Export and import also verify original-byte hashes.');
    return { valid: errors.length === 0, errors: Array.from(new Set(errors)), warnings };
  }
  async function verifySources(c) {
    for (const s of c.sources) if (await digest(bytesFromBase64(s.originalBase64)) !== s.hash) throw new Error('Original source hash mismatch: ' + s.name);
  }
  function assertCase(c) { const v = validateCase(c); if (!v.valid) throw new Error(v.errors.join(' ')); return v; }
  async function exportCase(c) {
    assertCase(c); await verifySources(c);
    const payload = JSON.stringify(c);
    if (payload.length > LIMITS.packageChars) throw new Error('Case package exceeds size limits.');
    const encoded = JSON.stringify({ format: 'pbgc-rag-case', version: VERSION, algorithm: 'SHA-256', hash: await digest(new TextEncoder().encode(payload)), payload });
    if (encoded.length > LIMITS.packageChars + 1024 * 1024) throw new Error('Encoded case package exceeds size limits.');
    return encoded;
  }
  async function importCase(json) {
    if (typeof json !== 'string' || json.length > LIMITS.packageChars + 1024 * 1024) throw new Error('Case package is invalid or too large.');
    let envelope; try { envelope = JSON.parse(json); } catch { throw new Error('Case package is not valid JSON.'); }
    if (!plain(envelope) || envelope.format !== 'pbgc-rag-case' || envelope.version !== VERSION || envelope.algorithm !== 'SHA-256' || typeof envelope.payload !== 'string' || envelope.payload.length > LIMITS.packageChars || !/^[a-f0-9]{64}$/.test(envelope.hash)) throw new Error('Unsupported or malformed case package.');
    if (await digest(new TextEncoder().encode(envelope.payload)) !== envelope.hash) throw new Error('Case package integrity check failed.');
    let c; try { c = JSON.parse(envelope.payload); } catch { throw new Error('Case payload is not valid JSON.'); }
    assertCase(c); await verifySources(c); return c;
  }
  function buildReport(c) {
    const validation = assertCase(c);
    const screening = claimScreening(c);
    const evidence = c.sources.flatMap(s => s.records.map(r => ({ recordId: r.id, sourceId: s.id, sourceName: s.name, sourceHash: s.hash, excerpt: r.text, locator: r.locator, verification: 'unverified', authority: 'not assessed', applicability: 'not assessed' })));
    return {
      schemaVersion: VERSION, kind: 'internal-case-review', status: 'PROVISIONAL', official: false,
      title: 'Internal case review draft', caseId: c.id, caseName: c.name,
      conflictScreening: screening,
      disclaimer: 'This is not an official R1 memo, BSRS configuration, benefit determination, or approved actuarial interpretation.',
      sections: [
        { heading: 'Case facts', text: 'Review imported source evidence. No legal or actuarial conclusions are inferred.', evidence },
        { heading: 'Unresolved claim screening', screening },
        { heading: 'Proposed and approved rules', rules: JSON.parse(JSON.stringify(c.rules)) },
        { heading: 'Synthetic calculation traces', calculations: JSON.parse(JSON.stringify(c.calculations)) },
        { heading: 'Assumptions and limitations', items: ['Source authority and participant applicability require review.', 'Contradictions are not automatically resolved.', 'Package integrity does not establish factual accuracy.', ...OFFICIAL_BLOCKERS] },
        { heading: 'Review checklist', items: ['Confirm case isolation and source completeness.', 'Review every citation against its original bytes.', 'Resolve conflicting provisions and applicable dates.', 'Confirm all interpretations with an authorized reviewer.', 'Validate numerical results independently.', 'Keep official release blocked until all official gates pass.'] }
      ],
      bsrs: { schemaVersion: VERSION, kind: 'provisional-internal-representation', officialSyntax: false, caseId: c.id, rules: c.rules.map(r => ({ id: r.id, version: r.version, status: r.status, sourceRecordIds: r.sourceRecordIds })), diagnostics: ['No authoritative BSRS grammar is installed. Do not submit this representation as BSRS configuration.'] },
      validation, release: { allowed: false, status: 'BLOCKED', blockers: [...OFFICIAL_BLOCKERS] }
    };
  }
  function proposeRule(c, p) {
    assertCase(c);
    if (c.rules.length >= LIMITS.rules) throw new Error('Rule limit exceeded.');
    if (!plain(p) || !str(p.id, 200) || c.rules.some(r => r.id === p.id) || !str(p.title, 300) || !isoDate(p.effectiveDate) || !Array.isArray(p.sourceRecordIds) || !p.sourceRecordIds.length || new Set(p.sourceRecordIds).size !== p.sourceRecordIds.length) throw new Error('Proposal needs a unique id, title, effective date, and source evidence.');
    const recordIds = new Set(c.sources.flatMap(s => s.records.map(r => r.id)));
    if (p.sourceRecordIds.some(id => !recordIds.has(id))) throw new Error('Proposal evidence is outside this case.');
    const rule = { id: p.id, version: 1, title: p.title, effectiveDate: p.effectiveDate, sourceRecordIds: [...p.sourceRecordIds], status: 'proposed', synthetic: p.synthetic === true, formula: p.formula === 'synthetic-accrual-v1' ? p.formula : null, interpretation: typeof p.interpretation === 'string' ? p.interpretation.slice(0, 10000) : '', rounding: 'half up to nearest cent', inputContract: ['annualSalaryCents', 'serviceMonths', 'accrualBasisPoints'], outputContract: ['annualBenefitCents', 'monthlyBenefitCents'] };
    c.rules.push(rule); return rule;
  }
  function approveRule(c, id, approval) {
    assertCase(c);
    const r = c.rules.find(x => x.id === id);
    if (!r || r.status !== 'proposed') throw new Error('Only a proposed rule can be approved.');
    if (!plain(approval) || !str(approval.reviewer, 200) || !str(approval.statement, 2000) || approval.confirmedByHuman !== true) throw new Error('Explicit human confirmation, reviewer, and approval statement are required.');
    r.status = 'approved'; r.approval = { reviewer: approval.reviewer, statement: approval.statement, approvedAt: new Date().toISOString(), confirmedByHuman: true };
    return r;
  }
  function syntheticAmounts(inputs) {
    if (!plain(inputs)) throw new Error('Inputs are required.');
    for (const [k, max] of [['annualSalaryCents', 1000000000], ['serviceMonths', 1200], ['accrualBasisPoints', 10000]]) if (!Number.isSafeInteger(inputs[k]) || inputs[k] < 0 || inputs[k] > max) throw new Error('Invalid synthetic input: ' + k);
    const numerator = BigInt(inputs.annualSalaryCents) * BigInt(inputs.serviceMonths) * BigInt(inputs.accrualBasisPoints);
    const round = (n, d) => Number((n * 2n + d) / (2n * d));
    return { annualBenefitCents: round(numerator, 120000n), monthlyBenefitCents: round(numerator, 1440000n), trace: { numerator: numerator.toString(), annualDenominator: '120000', monthlyDenominator: '1440000' } };
  }
  function calculateSynthetic(c, id, inputs) {
    assertCase(c);
    const r = c.rules.find(x => x.id === id);
    if (!r || r.status !== 'approved' || r.synthetic !== true || r.formula !== 'synthetic-accrual-v1') throw new Error('Calculation requires an approved, explicitly synthetic accrual rule.');
    if (c.calculations.length >= 10000) throw new Error('Calculation limit exceeded.');
    const amounts = syntheticAmounts(inputs);
    const result = { schemaVersion: VERSION, synthetic: true, official: false, ruleId: r.id, ruleVersion: r.version, inputs: { annualSalaryCents: inputs.annualSalaryCents, serviceMonths: inputs.serviceMonths, accrualBasisPoints: inputs.accrualBasisPoints }, annualBenefitCents: amounts.annualBenefitCents, monthlyBenefitCents: amounts.monthlyBenefitCents, rounding: 'half up to nearest cent; annual and monthly values independently rounded from exact rational amounts', trace: amounts.trace, limitation: 'Synthetic arithmetic only. This does not model an actual plan, PBGC guarantee, interest, mortality, limits, or statutory benefit.' };
    c.calculations.push(result); return result;
  }
  const api = { validateCase, exportCase, importCase, buildReport, proposeRule, approveRule, calculateSynthetic, ARTIFACT_LIMITS: LIMITS, OFFICIAL_BLOCKERS };
  root.PBGC = Object.assign(root.PBGC || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
