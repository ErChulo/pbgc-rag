/* Nonofficial report layouts and safe portable representations. No inference. */
(function (root, factory) {
  'use strict';
  const review = typeof module === 'object' && module.exports ? require('./review.js') : root.PBGCRag;
  const api = factory(review);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PBGCRag = Object.assign(root.PBGCRag || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (review) {
  'use strict';
  const TABLES = ['inventory', 'evidence', 'timeline'];
  const HASH = /^[a-f0-9]{64}$/;
  const LIMITS = Object.freeze({timeline:200, evidence:200, title:160, label:500});
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function fail(message) { throw new Error(message); }
  function day(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(value + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value; }
  function canonical(value, depth = 0) {
    if (depth > 16) fail('Locator exceeds the report depth limit.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(item => canonical(item, depth + 1)).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
    fail('Locator contains an unsupported value.');
  }
  /** Reusable layout v1: sections are explicitly selected, not executable templates.
   * {schemaVersion:1,title,sections:['inventory','evidence','timeline'],maxEvidence:1..200,
   * timeline?:[{date:'YYYY-MM-DD',label,sourceHash,locator}]}
   */
  function validateReportLayout(config) {
    const errors = [];
    if (!object(config)) return {valid:false,errors:['Report layout must be an object.']};
    if (Object.keys(config).some(key => !['schemaVersion','title','sections','maxEvidence','timeline'].includes(key))) errors.push('Report layout contains unsupported fields.');
    if (config.schemaVersion !== 1) errors.push('Only report layout schema v1 is supported.');
    if (typeof config.title !== 'string' || !config.title.trim() || config.title.length > LIMITS.title) errors.push('Provide a report title of at most 160 characters.');
    if (!Array.isArray(config.sections) || config.sections.length < 1 || config.sections.length > 3 || config.sections.some(section => !TABLES.includes(section)) || new Set(config.sections).size !== config.sections.length) errors.push('Choose distinct inventory, evidence or timeline sections.');
    if (config.maxEvidence !== undefined && (!Number.isInteger(config.maxEvidence) || config.maxEvidence < 1 || config.maxEvidence > LIMITS.evidence)) errors.push('Evidence limit must be an integer from one to 200.');
    if (config.timeline !== undefined) {
      if (!Array.isArray(config.timeline) || config.timeline.length > LIMITS.timeline) errors.push('Timeline is limited to 200 entries.');
      else config.timeline.forEach((item, index) => {
        let validLocator = false;
        try { validLocator = object(item?.locator) && Object.keys(item.locator).length > 0 && canonical(item.locator).length <= 4000; } catch (_) { /* Rejected below. */ }
        if (!object(item) || Object.keys(item).some(key => !['date','label','sourceHash','locator'].includes(key)) || !day(item.date) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > LIMITS.label || !HASH.test(item.sourceHash) || !validLocator) errors.push('Timeline entry ' + (index + 1) + ' requires a valid explicit date, bounded label, source hash and locator.');
      });
    }
    return {valid:errors.length === 0,errors};
  }
  function buildReport(workspace, config) {
    const validation = validateReportLayout(config);
    if (!validation.valid) fail(validation.errors.join(' '));
    const base = review.buildReview(workspace);
    const evidenceLimit = config.maxEvidence === undefined ? LIMITS.evidence : config.maxEvidence;
    const timeline = (config.timeline || []).map((event, index) => {
      const source = workspace.sources.find(item => item.hash === event.sourceHash);
      const targetLocator = canonical(event.locator);
      if (!source || !source.records.some(record => canonical(record.locator) === targetLocator)) fail('Timeline entry ' + (index + 1) + ' does not resolve to a source record.');
      const inventory = base.inventory.find(item => item.sourceHash === event.sourceHash);
      return { date:event.date, label:event.label, sourceRef:inventory.sourceRef, sourceHash:event.sourceHash, locator:JSON.parse(JSON.stringify(event.locator)), verification:'unverified user-supplied date', meaning:'No legal effective date or applicability is inferred.' };
    }).sort((a,b) => a.date.localeCompare(b.date) || a.sourceRef.localeCompare(b.sourceRef) || a.label.localeCompare(b.label));
    return { schemaVersion:1, kind:'nonofficial-source-report', official:false, officialReleaseAllowed:false,
      title:config.title, caseName:workspace.name, sections:[...config.sections],
      layout:{schemaVersion:1,title:config.title,sections:[...config.sections],maxEvidence:evidenceLimit,timeline:JSON.parse(JSON.stringify(config.timeline || []))},
      inventory:config.sections.includes('inventory') ? base.inventory : [],
      evidence:config.sections.includes('evidence') ? base.evidence.slice(0,evidenceLimit) : [],
      timeline:config.sections.includes('timeline') ? timeline : [],
      coverage:{sourceCount:base.inventory.length,totalRecords:base.totalRecords,shownEvidence:config.sections.includes('evidence') ? Math.min(base.evidence.length,evidenceLimit) : 0,maxEvidence:evidenceLimit,maxExcerptCharacters:2000},
      summary:`${base.inventory.length} source documents; ${base.totalRecords} parsed records. Documentary text is unverified. No legal or actuarial interpretation is generated.`,
      blockers:[...base.blockers],
      warnings:['NONOFFICIAL REPORT — NOT AN OFFICIAL ARTIFACT.','Source integrity must be verified through the case package workflow.','Timeline dates are explicit user assertions linked to source records; they are not automatically verified.','Evidence excerpts may be incomplete. Read original source documents.'] };
  }
  function checkedReport(report) {
    if (!object(report) || report.schemaVersion !== 1 || report.kind !== 'nonofficial-source-report' || report.official !== false || report.officialReleaseAllowed !== false || typeof report.title !== 'string' || typeof report.caseName !== 'string' || typeof report.summary !== 'string' || !Array.isArray(report.sections) || report.sections.some(section => !TABLES.includes(section)) || !Array.isArray(report.warnings) || !Array.isArray(report.blockers)) fail('Invalid nonofficial report.');
    for (const table of TABLES) if (!Array.isArray(report[table]) || report[table].length > 200 || report[table].some(row => !object(row))) fail('Invalid report table.');
    if (!object(report.coverage)) fail('Invalid report coverage.');
    return report;
  }
  function tableRows(report, table) {
    if (table === 'inventory') return {head:['Source reference','Source name','SHA-256','Parser version','Record count','Authority','Applicability'],rows:report.inventory.map(row => [row.sourceRef,row.name,row.sourceHash,row.parserVersion,row.recordCount,row.authority,row.applicability])};
    if (table === 'evidence') return {head:['Evidence reference','Source reference','SHA-256','Locator','Excerpt','Excerpt truncated','Verification'],rows:report.evidence.map(row => [row.evidenceId,row.sourceRef,row.sourceHash,canonical(row.locator),row.excerpt,String(row.excerptTruncated),row.verification])};
    return {head:['Explicit date','Label','Source reference','SHA-256','Locator','Verification','Meaning'],rows:report.timeline.map(row => [row.date,row.label,row.sourceRef,row.sourceHash,canonical(row.locator),row.verification,row.meaning])};
  }
  function csvCell(value) {
    let text = value === undefined || value === null ? '' : String(value);
    // Quoting alone does not stop spreadsheet formulas. Prefix risky text with an apostrophe.
    if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g,'""') + '"';
  }
  /** CSV contains data only and deliberately neutralizes spreadsheet formula prefixes. */
  function reportToCSV(report, table = 'inventory') {
    checkedReport(report);
    if (!TABLES.includes(table) || !report.sections.includes(table)) fail('Choose a table included in the report layout.');
    const data = tableRows(report,table);
    return [data.head,...data.rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  const escapeHTML = value => String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  /** Standalone, script-free HTML. No styles, image URLs, forms or remote dependencies. */
  function renderReportHTML(report) {
    checkedReport(report);
    const sections = report.sections.map(table => {
      const data = tableRows(report,table);
      const titles = {inventory:'Source inventory',evidence:'Documentary excerpts',timeline:'Explicit source-linked dates'};
      return '<section><h2>' + titles[table] + '</h2><table><caption>' + titles[table] + ' — unverified</caption><thead><tr>' + data.head.map(cell => '<th scope="col">'+escapeHTML(cell)+'</th>').join('') + '</tr></thead><tbody>' + data.rows.map(row => '<tr>' + row.map((cell,index) => '<td>' + (table === 'evidence' && index === 4 ? '<pre>' + escapeHTML(cell) + '</pre>' : escapeHTML(cell)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></section>';
    }).join('');
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'none\'; img-src \'none\'; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>' + escapeHTML(report.title) + '</title></head><body><main><h1>' + escapeHTML(report.title) + '</h1><p>Case: ' + escapeHTML(report.caseName) + '</p><p><strong>NONOFFICIAL REPORT — NOT AN OFFICIAL ARTIFACT</strong></p><p>' + escapeHTML(report.summary) + '</p><p>Excerpt coverage: ' + escapeHTML(report.coverage.shownEvidence) + ' records shown out of ' + escapeHTML(report.coverage.totalRecords) + ' parsed records. Maximum ' + escapeHTML(report.coverage.maxExcerptCharacters) + ' characters per excerpt.</p><section><h2>Limitations</h2><ul>' + report.warnings.map(item=>'<li>'+escapeHTML(item)+'</li>').join('') + '</ul></section>' + sections + '<section><h2>Release blockers</h2><ul>' + report.blockers.map(item=>'<li>'+escapeHTML(item)+'</li>').join('') + '</ul></section></main></body></html>\n';
  }
  return {validateReportLayout,buildReport,reportToCSV,renderReportHTML};
});
