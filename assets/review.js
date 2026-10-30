/* Provisional internal review tools. No official artifact or actuarial rule engine. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const HASH = /^[a-f0-9]{64}$/;
  const BLOCKERS = Object.freeze([
    'Official field validation is blocked: the approved versioned data_dictionary_complete.xlsm is not supplied.',
    'Official R1 and other template outputs are blocked: authorized original templates and field maps are not supplied.',
    'Official BSRS generation is blocked: authoritative syntax, field maps and validator are not supplied.',
    'Actuarial interpretation and calculation are blocked: approved case-specific rules and authoritative reference specifications are not supplied.',
    'Evidence applicability, authority and contradictions require human review; excerpts are not approved facts.'
  ]);
  function fail(message) { throw new Error(message); }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function locator(value) { try { return isObject(value) && Object.keys(value).length > 0 && JSON.stringify(value).length <= 4000; } catch (_) { return false; } }
  /** Synthetic arithmetic rule contract v1. Approval metadata records a claim, not authenticated identity.
   * {schemaVersion:1,id,version,kind:'synthetic-arithmetic',status:'approved',
   * approval:{reviewer,at:'YYYY-MM-DD',ruleVersion},effectiveFrom,effectiveTo?,
   * sources:[{sourceHash,locator}],operation:'add'|'subtract'|'multiply'|'divide',
   * inputs:['left','right'],output:{scale:0..12,rounding:'half-away-from-zero'}}
   */
  function validateRule(rule) {
    const errors = [];
    if (!isObject(rule)) return { valid: false, errors: ['Rule must be an object.'] };
    if (rule.schemaVersion !== 1 || rule.kind !== 'synthetic-arithmetic') errors.push('Only synthetic arithmetic rule schema v1 is supported.');
    if (typeof rule.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(rule.id)) errors.push('Rule ID is invalid.');
    if (typeof rule.version !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(rule.version)) errors.push('Rule version is invalid.');
    if (rule.status !== 'approved') errors.push('Rule is not approved.');
    if (!isObject(rule.approval) || typeof rule.approval.reviewer !== 'string' || !rule.approval.reviewer.trim() || rule.approval.reviewer.length > 120 || !date(rule.approval.at) || rule.approval.ruleVersion !== rule.version) errors.push('Approval must identify the reviewer, date and exact rule version.');
    if (!date(rule.effectiveFrom) || (rule.effectiveTo !== undefined && (!date(rule.effectiveTo) || rule.effectiveTo < rule.effectiveFrom))) errors.push('Rule effective dates are invalid.');
    if (!Array.isArray(rule.sources) || rule.sources.length < 1 || rule.sources.length > 50 || rule.sources.some(source => !isObject(source) || !HASH.test(source.sourceHash) || !locator(source.locator))) errors.push('Rule requires bounded source hashes and exact locators.');
    if (!['add', 'subtract', 'multiply', 'divide'].includes(rule.operation)) errors.push('Unsupported arithmetic operation.');
    if (!Array.isArray(rule.inputs) || rule.inputs.length !== 2 || rule.inputs.some(name => typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) || rule.inputs[0] === rule.inputs[1]) errors.push('Rule requires two distinct internal input names.');
    if (!isObject(rule.output) || !Number.isInteger(rule.output.scale) || rule.output.scale < 0 || rule.output.scale > 12 || rule.output.rounding !== 'half-away-from-zero') errors.push('Rule requires a scale from zero to 12 and explicit half-away-from-zero rounding.');
    return { valid: errors.length === 0, errors };
  }
  function decimal(value) {
    // Strings avoid binary floating-point conversion; exponent notation is deliberately unavailable.
    if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/.test(value)) fail('Inputs must be decimal strings with at most 18 integer and 12 fractional digits.');
    const parts = value.split('.');
    return { numerator: BigInt(parts[0] + (parts[1] || '')), denominator: 10n ** BigInt((parts[1] || '').length) };
  }
  /** calculate(rule, inputs, {asOf}) never resolves source facts or activates proposed rules. */
  function calculate(rule, inputs, context) {
    const validation = validateRule(rule);
    if (!validation.valid) fail(validation.errors.join(' '));
    if (!isObject(context) || !date(context.asOf)) fail('Provide a valid calculation as-of date.');
    if (context.asOf < rule.effectiveFrom || (rule.effectiveTo !== undefined && context.asOf > rule.effectiveTo)) fail('Rule is outside its effective period.');
    if (rule.approval.at > context.asOf) fail('Rule approval occurs after the calculation date.');
    if (!isObject(inputs) || Object.keys(inputs).length !== 2 || rule.inputs.some(name => !Object.prototype.hasOwnProperty.call(inputs, name))) fail('Inputs must match the rule input contract exactly.');
    const [a, b] = rule.inputs.map(name => decimal(inputs[name]));
    let numerator, denominator;
    if (rule.operation === 'add' || rule.operation === 'subtract') {
      numerator = a.numerator * b.denominator + (rule.operation === 'add' ? 1n : -1n) * b.numerator * a.denominator;
      denominator = a.denominator * b.denominator;
    } else if (rule.operation === 'multiply') { numerator = a.numerator * b.numerator; denominator = a.denominator * b.denominator; }
    else { if (b.numerator === 0n) fail('Division by zero is not allowed.'); numerator = a.numerator * b.denominator; denominator = a.denominator * b.numerator; }
    if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
    const factor = 10n ** BigInt(rule.output.scale), scaled = numerator * factor;
    const magnitude = scaled < 0n ? -scaled : scaled;
    let rounded = magnitude / denominator;
    if ((magnitude % denominator) * 2n >= denominator) rounded++;
    const negative = scaled < 0n && rounded !== 0n;
    let digits = rounded.toString().padStart(rule.output.scale + 1, '0');
    if (rule.output.scale) digits = digits.slice(0, -rule.output.scale) + '.' + digits.slice(-rule.output.scale);
    const value = (negative ? '-' : '') + digits;
    return { schemaVersion: 1, kind: 'synthetic-calculation', official: false, ruleId: rule.id, ruleVersion: rule.version, asOf: context.asOf, value,
      trace: { operation: rule.operation, inputs: rule.inputs.map(name => ({ name, value: inputs[name] })), exactNumerator: numerator.toString(), exactDenominator: denominator.toString(), scale: rule.output.scale, rounding: rule.output.rounding },
      sources: JSON.parse(JSON.stringify(rule.sources)), warning: 'Synthetic arithmetic only. This does not establish an actuarial result or authenticate approval.' };
  }
  /** buildReview(workspace) returns deterministic provisional text and internal JSON. No official export. */
  function buildReview(workspace) {
    if (!isObject(workspace) || workspace.schemaVersion !== 1 || typeof workspace.name !== 'string' || !workspace.name.trim() || workspace.name.length > 100 || !Array.isArray(workspace.sources) || workspace.sources.length > 200) fail('Invalid workspace for review.');
    const inventory = [], evidence = []; let totalRecords = 0;
    workspace.sources.forEach((source, index) => {
      if (!isObject(source) || typeof source.name !== 'string' || source.name.length > 255 || !HASH.test(source.hash) || !Array.isArray(source.records)) fail('Review requires source names, hashes and parsed records.');
      totalRecords += source.records.length;
      if (totalRecords > 50000) fail('Review exceeds the 50,000 record limit.');
      const sourceRef = 'S' + (index + 1);
      inventory.push({ sourceRef, name: source.name, sourceHash: source.hash, parserVersion: String(source.parserVersion || 'unknown'), recordCount: source.records.length, authority: 'unreviewed', applicability: 'unreviewed' });
      source.records.forEach((record, recordIndex) => {
        if (!isObject(record) || typeof record.text !== 'string' || record.text.length > 2000000 || !locator(record.locator)) fail('Review requires valid evidence text and locators.');
        // Excerpt inventory is deliberately bounded and announces omissions. No text is interpreted.
        if (evidence.length < 200 && record.text.trim()) evidence.push({ evidenceId: sourceRef + ':R' + (recordIndex + 1), sourceRef, sourceHash: source.hash, locator: JSON.parse(JSON.stringify(record.locator)), excerpt: record.text.slice(0, 2000), excerptTruncated: record.text.length > 2000, verification: 'unverified', authority: 'unreviewed', applicability: 'unreviewed' });
      });
    });
    const blockers = [...BLOCKERS];
    if (!inventory.length) blockers.unshift('No source documents are loaded.');
    const checklist = [
      { id: 'source-integrity', status: 'REVIEW', instruction: 'Verify source-byte hashes through the case package workflow.' },
      { id: 'evidence', status: 'REVIEW', instruction: 'Read each original source. Check locators, authority, applicability and conflicts.' },
      { id: 'facts', status: 'BLOCKED', instruction: 'Identify and approve case facts. Imported excerpts are not approved facts.' },
      { id: 'rules', status: 'BLOCKED', instruction: 'Supply approved, versioned legal and actuarial rules with exact sources.' },
      { id: 'numerical', status: 'BLOCKED', instruction: 'Compare every actuarial calculation with independently derived expected results.' },
      { id: 'official-release', status: 'BLOCKED', instruction: 'Supply and validate official dictionary, syntax and templates before release.' }
    ];
    const excerpts = evidence.map(item => `[${item.evidenceId}] ${JSON.stringify(item.locator)}\n${item.excerpt}${item.excerptTruncated ? '\n[Excerpt truncated]' : ''}`).join('\n\n');
    const r1Draft = [
      'PROVISIONAL INTERNAL R1 REVIEW DRAFT — NOT AN OFFICIAL ARTIFACT',
      'Case: ' + workspace.name,
      'Status: blocked for official release. No actuarial determination is made.',
      '\nSource inventory',
      ...inventory.map(item => `[${item.sourceRef}] ${item.name}\nSHA-256: ${item.sourceHash}\nRecords: ${item.recordCount}; authority and applicability unreviewed`),
      '\nDocumentary excerpts — unverified; not approved case facts',
      excerpts || 'No documentary excerpts are available.',
      `Excerpt coverage: ${evidence.length} nonempty records shown; ${totalRecords} parsed records in the case. Maximum 200 excerpts and 2,000 characters per excerpt. Review original sources for complete content.`,
      '\nApproved facts, interpretations and assumptions',
      'None established by this tool. A reviewer must supply and approve these items.',
      '\nCalculations',
      'No actuarial calculation is included. No official numerical validity is asserted.',
      '\nUnresolved items and release blockers', ...blockers.map(item => '- ' + item),
      '\nReview checklist', ...checklist.map(item => `[${item.status}] ${item.instruction}`)
    ].join('\n');
    const bsrs = { schemaVersion: 1, kind: 'internal-bsrs-planning', official: false, executable: false, status: 'BLOCKED', caseName: workspace.name, syntax: 'UNAVAILABLE — this object is not BSRS configuration text', fieldMap: [], scenarios: [], sourceInventory: inventory, blockers: [...blockers] };
    return { schemaVersion: 1, kind: 'provisional-case-review', official: false, officialReleaseAllowed: false, caseName: workspace.name, inventory, evidence, totalRecords, excerptLimit: 200, interpretations: [], assumptions: [], calculations: [], checklist, blockers, r1Draft, bsrs };
  }
  return { validateRule, calculate, buildReview };
});
