/* Standalone, source-linked internal research reports. No official template is implied. */
(function (root) {
  'use strict';
  const REPORT_LAYOUTS = Object.freeze({
    review: Object.freeze({ schemaVersion: 1, key: 'review', title: 'Internal case review', sections: Object.freeze(['sources', 'timeline', 'rules', 'calculations', 'evidence']) }),
    evidence: Object.freeze({ schemaVersion: 1, key: 'evidence', title: 'Source evidence review', sections: Object.freeze(['sources', 'evidence', 'timeline', 'rules', 'calculations']) })
  });
  const escape = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Encode UTF-16 units, so arbitrary record IDs remain unique, stable, safe HTML fragment IDs.
  const evidenceAnchor = id => 'evidence-' + Array.from({ length: id.length }, (_, i) => id.charCodeAt(i).toString(16).padStart(4, '0')).join('');
  const sourceAnchor = source => 'source-' + source.hash;
  const link = (anchor, label) => '<a href="#' + escape(anchor) + '">' + escape(label) + '</a>';
  const json = value => escape(JSON.stringify(value, null, 2));
  const dateLabel = value => new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
  const title = { sources: 'Source inventory', evidence: 'Source evidence', timeline: 'Proposed rule applicability timeline', rules: 'Rule review status', calculations: 'Synthetic calculation traces' };
  function getReportLayout(key) {
    if (typeof key !== 'string' || !Object.hasOwn(REPORT_LAYOUTS, key)) throw new Error('Unsupported report layout. Choose review or evidence.');
    return REPORT_LAYOUTS[key];
  }
  function renderResearchReport(c, options = {}) {
    if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(k => k !== 'layout')) throw new Error('Report options may contain only a supported layout key.');
    const layout = getReportLayout(options.layout === undefined ? 'review' : options.layout);
    const api = root.PBGC && typeof root.PBGC.validateCase === 'function' ? root.PBGC : typeof require === 'function' ? require('./artifacts.js') : null;
    if (!api) throw new Error('Case validation is required before report generation.');
    const validation = api.validateCase(c);
    if (!validation.valid) throw new Error('Report blocked: ' + validation.errors.join(' '));
    // Bound rendered input before allocating escaped HTML. Original bytes are not embedded.
    let renderChars = 0, renderRecords = 0;
    function countContent(value) {
      if (typeof value === 'string') renderChars += value.length;
      else if (Array.isArray(value)) for (const item of value) countContent(item);
      else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { renderChars += key.length; countContent(item); }
      if (renderChars > 4 * 1024 * 1024) throw new Error('Report exceeds the 4 MiB rendered-content limit. Split the case for reporting.');
    }
    for (const source of c.sources) {
      renderRecords += source.records.length;
      if (renderRecords > 5000) throw new Error('Report exceeds the 5000-record limit. Split the case for reporting.');
      countContent({ name: source.name, records: source.records });
    }
    countContent(c.rules); countContent(c.calculations);
    const report = api.buildReport(c), records = new Map();
    for (const source of c.sources) for (const record of source.records) records.set(record.id, { source, record });
    const citations = ids => ids.map(id => {
      const item = records.get(id);
      if (!item) throw new Error('Report blocked: source evidence reference does not exist in this case.');
      return link(evidenceAnchor(id), item.source.name + ' · ' + item.record.locator.label);
    }).join('; ');
    const inventory = '<table><caption>Imported source files</caption><thead><tr><th scope="col">Source</th><th scope="col">Format</th><th scope="col">Bytes</th><th scope="col">Records</th></tr></thead><tbody>' + c.sources.map(source => '<tr><th scope="row">' + link(sourceAnchor(source), source.name) + '</th><td>' + escape(source.format) + '</td><td>' + source.size + '</td><td>' + source.records.length + '</td></tr>').join('') + '</tbody></table>' + (!c.sources.length ? '<p>No source evidence is imported.</p>' : '');
    const evidence = c.sources.map(source => '<article id="' + sourceAnchor(source) + '"><h3>' + escape(source.name) + '</h3><dl><dt>SHA-256 of original bytes</dt><dd><code>' + source.hash + '</code></dd><dt>Source identity</dt><dd><code>' + escape(source.id) + '</code></dd><dt>Original source</dt><dd>Original bytes are retained in the case package. This report contains extracted text only.</dd></dl>' + source.records.map(record => '<section id="' + evidenceAnchor(record.id) + '" class="evidence"><h4>' + escape(record.locator.label) + '</h4><p>Verification: unverified. Authority and applicability: not assessed.</p><p>Source: ' + link(sourceAnchor(source), source.name) + '</p><p>Record identity: <code>' + escape(record.id) + '</code></p><details><summary>Exact locator metadata</summary><pre>' + json(record.locator) + '</pre></details><blockquote><pre>' + escape(record.text) + '</pre></blockquote>' + (record.fields === undefined ? '' : '<details><summary>Extracted fields</summary><pre>' + json(record.fields) + '</pre></details>') + '</section>').join('') + '</article>').join('') || '<p>No evidence is available. Do not infer case facts.</p>';
    const rules = c.rules.map(rule => '<article><h3>' + escape(rule.title) + '</h3><p>Status: <strong>' + escape(rule.status) + '</strong>. Version: ' + rule.version + '. ' + (rule.synthetic === true ? 'Synthetic rule only.' : 'An approval record does not establish official actuarial validity.') + '</p><p>Proposed applicability date: ' + escape(dateLabel(rule.effectiveDate)) + '</p><p>' + escape(rule.interpretation || 'No interpretation text supplied.') + '</p><p>Evidence: ' + citations(rule.sourceRecordIds) + '</p>' + (rule.approval ? '<details><summary>Self-recorded human approval metadata</summary><pre>' + json(rule.approval) + '</pre></details><p>This record does not authenticate reviewer identity.</p>' : '<p>Human approval is not recorded. This rule is not active.</p>') + '</article>').join('') || '<p>No rules are recorded.</p>';
    const timeline = '<p>These dates describe proposed rule applicability. They do not establish legal effective dates.</p><ol>' + [...c.rules].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id)).map(rule => '<li><time datetime="' + escape(rule.effectiveDate) + '">' + escape(dateLabel(rule.effectiveDate)) + '</time> — ' + escape(rule.title) + ' [' + escape(rule.status) + ']. Evidence: ' + citations(rule.sourceRecordIds) + '</li>').join('') + '</ol>' + (!c.rules.length ? '<p>No rule dates are recorded.</p>' : '');
    const calculations = '<p>These traces are synthetic arithmetic. They do not determine an actual plan benefit, guarantee, or statutory limit.</p>' + c.calculations.map(calculation => {
      const rule = c.rules.find(rule => rule.id === calculation.ruleId);
      return '<article><h3>' + escape(rule.title) + '</h3><p>Status: synthetic, provisional, official release BLOCKED.</p><p>Rule version: ' + calculation.ruleVersion + '. Evidence: ' + citations(rule.sourceRecordIds) + '</p><dl><dt>Annual benefit in cents (synthetic)</dt><dd>' + calculation.annualBenefitCents + '</dd><dt>Monthly benefit in cents (synthetic)</dt><dd>' + calculation.monthlyBenefitCents + '</dd><dt>Rounding</dt><dd>' + escape(calculation.rounding) + '</dd></dl><details><summary>Inputs and exact rational trace</summary><pre>' + json({ inputs: calculation.inputs, trace: calculation.trace }) + '</pre></details><p>' + escape(calculation.limitation) + '</p></article>';
    }).join('') + (!c.calculations.length ? '<p>No synthetic calculations are recorded.</p>' : '');
    const contents = { sources: inventory, evidence, rules, timeline, calculations };
    const sections = layout.sections.map(key => '<section id="' + key + '"><h2>' + title[key] + '</h2>' + contents[key] + '</section>').join('');
    const blockers = report.release.blockers.map(item => '<li>' + escape(item) + '</li>').join('');
    const css = 'body{font-family:Arial,sans-serif;color:#111;background:#fff;max-width:72rem;margin:2rem auto;padding:0 1.25rem;line-height:1.55}h1,h2,h3{color:#002D72}a{color:#002D72;text-underline-offset:.18em}a:focus-visible,summary:focus-visible{outline:3px solid #E4002B;outline-offset:3px}.status{border-left:5px solid #E4002B;padding:1rem;background:#f2f2f2}table{border-collapse:collapse;width:100%}th,td{text-align:left;border:1px solid #81807F;padding:.5rem}caption{text-align:left;font-weight:bold}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin:1rem 0;padding-left:1rem;border-left:3px solid #002D72}.evidence{border-top:1px solid #81807F;margin-top:1rem;padding-top:.5rem}dt{font-weight:bold}dd{margin:0 0 .5rem}nav ul{display:flex;gap:1.5rem;flex-wrap:wrap;list-style:none;padding:0}section,article{scroll-margin-top:1rem}@media print{body{max-width:none;margin:0}nav{display:none}h2{break-before:auto}article{break-inside:auto}a{color:inherit}}';
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; connect-src \'none\'; img-src \'none\'; font-src \'none\'; media-src \'none\'; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'; style-src \'unsafe-inline\'"><title>' + escape(c.name) + ' — ' + layout.title + '</title><style>' + css + '</style></head><body><header><p>PBGC-RAG · Internal research · Layout ' + layout.key + ' version ' + layout.schemaVersion + '</p><h1>' + layout.title + '</h1><p>Case: ' + escape(c.name) + ' · <code>' + escape(c.id) + '</code></p><p>Case created: ' + escape(dateLabel(c.createdAt)) + '</p><div class="status"><strong>PROVISIONAL — Official output BLOCKED</strong><p>' + escape(report.disclaimer) + '</p><p>Do not use this report as an official benefit determination or approved template.</p></div></header><nav aria-label="Report contents"><ul>' + layout.sections.map(key => '<li>' + link(key, title[key]) + '</li>').join('') + '<li>' + link('official-gates', 'Official release gates') + '</li></ul></nav><main>' + sections + '<section id="official-gates"><h2>Official release gates</h2><p>Status: BLOCKED. Official release is not allowed.</p><ul>' + blockers + '</ul><p>Package hashes detect accidental changes. They do not authenticate sources, reviewers, extracted text, or interpretations.</p></section></main><footer><p>This project is not an official PBGC-approved product. No official logo or official template is reproduced.</p></footer></body></html>';
    if (html.length > 64 * 1024 * 1024) throw new Error('Report exceeds the 64 MiB output limit.');
    return html;
  }
  const api = { renderResearchReport, getReportLayout, REPORT_LAYOUTS };
  root.PBGC = Object.assign(root.PBGC || {}, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
