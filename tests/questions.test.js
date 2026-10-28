'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { parseFile } = require('../js/parsers.js');
require('../js/artifacts.js');
const { retrieveQuestionEvidence, questionRetrievalLimits } = require('../js/questions.js');
const clone = x => JSON.parse(JSON.stringify(x));
async function workspace(text, id = 'synthetic-question-case') {
  const source = await parseFile(new File([text], 'synthetic-question.txt'));
  return { schemaVersion: 1, id, name: 'Synthetic question retrieval case', createdAt: '2026-10-28', sources: [source], graph: { nodes: [], edges: [] }, rules: [], calculations: [] };
}
test('natural question retrieves exact source excerpt despite question stopwords, without generating an answer', async () => {
  const c = await workspace('SYNTHETIC TRAINING ONLY\nNormal retirement age is 65 in this fictional document.\nAge is not a benefit determination.');
  const before = clone(c), result = retrieveQuestionEvidence(c, 'What is normal retirement age?');
  assert.equal(result.status, 'evidence-found'); assert.equal(result.method, 'lexical-question-retrieval'); assert.equal(result.modelUsed, false);
  assert.deepEqual(result.terms, ['normal', 'retirement', 'age']);
  assert.equal(result.citations[0].excerpt, c.sources[0].records[1].text); assert.equal(result.citations[0].locator.line, 2);
  assert.equal(result.citations[0].sourceHash, c.sources[0].hash); assert.deepEqual(result.citations[0].matchedTerms, result.terms);
  assert.deepEqual(result.missingTerms, []); assert.equal(Object.hasOwn(result, 'answer'), false); assert.match(result.notice, /not an answer|not a legal/);
  result.citations[0].locator.line = 999; result.citations[0].matchedTerms.push('tampered'); assert.deepEqual(c, before);
});
test('unrelated and all-stopword questions abstain with explicit insufficient evidence', async () => {
  const c = await workspace('Synthetic normal retirement age is 65.');
  const unrelated = retrieveQuestionEvidence(c, 'What mortality tables apply?');
  assert.equal(unrelated.status, 'insufficient-evidence'); assert.deepEqual(unrelated.citations, []); assert.deepEqual(unrelated.missingTerms, ['mortality', 'tables', 'apply']);
  for (const query of ['', 'What is the?', 'please tell me about it']) { const r = retrieveQuestionEvidence(c, query); assert.equal(r.status, 'insufficient-evidence'); assert.deepEqual(r.terms, []); }
});
test('exact token boundaries never equate age and wage or apply stemming or synonyms', async () => {
  const c = await workspace('Synthetic wage benefit and retirement.');
  assert.equal(retrieveQuestionEvidence(c, 'age').status, 'insufficient-evidence');
  assert.equal(retrieveQuestionEvidence(c, 'retire').status, 'insufficient-evidence');
  assert.equal(retrieveQuestionEvidence(c, 'pension').status, 'insufficient-evidence');
});
test('partial numerical/date/sign/unit mismatches are retained and do not become inferred answers', async () => {
  const c = await workspace('Synthetic normal retirement age 65 effective 2026-01-01; amount $12,000.00; change -5; ratio 5%.');
  const r = retrieveQuestionEvidence(c, 'What is normal retirement age 67 effective 2027-01-01?');
  assert.equal(r.status, 'partial-evidence'); assert.deepEqual(r.missingTerms, ['67', '2027-01-01']);
  assert.equal(retrieveQuestionEvidence(c, 'amount $12000.00').status, 'partial-evidence');
  assert.deepEqual(retrieveQuestionEvidence(c, 'change +5').missingTerms, ['+5']);
  assert.deepEqual(retrieveQuestionEvidence(c, 'ratio 5').missingTerms, ['5']);
  assert.equal(retrieveQuestionEvidence(c, 'effective 2026-01-01').status, 'evidence-found');
});
test('different excerpts are not synthesized into complete evidence and missing terms describe returned coverage only', async () => {
  const c = await workspace('Synthetic retirement.\nSynthetic survivor.');
  const r = retrieveQuestionEvidence(c, 'retirement survivor');
  assert.equal(r.status, 'partial-evidence'); assert.equal(r.citations.length, 2); assert.deepEqual(r.missingTerms, []); assert.match(r.notice, /no returned excerpt contains them all/);
  const one = retrieveQuestionEvidence(c, 'retirement survivor', { limit: 1 }); assert.equal(one.status, 'partial-evidence'); assert.equal(one.missingTerms.length, 1);
});
test('BM25 ranking is deterministic and prioritizes complete single-excerpt token coverage', async () => {
  const c = await workspace('Synthetic normal retirement age.\nSynthetic normal retirement normal retirement normal retirement.\nSynthetic unrelated source terms.');
  const a = retrieveQuestionEvidence(c, 'normal retirement age', { limit: 2 }), b = retrieveQuestionEvidence(c, 'normal retirement age', { limit: 2 });
  assert.deepEqual(a, b); assert.equal(a.citations[0].locator.line, 1); assert.equal(a.citations.length, 2); assert.ok(a.citations.every(c => Number.isFinite(c.score) && c.score > 0));
});
test('Unicode normalization and repeated terms keep original excerpts unchanged', async () => {
  const c = await workspace('Synthetic Café ＡＧＥ café.');
  const r = retrieveQuestionEvidence(c, 'CAFÉ café age');
  assert.deepEqual(r.terms, ['café', 'age']); assert.equal(r.status, 'evidence-found'); assert.equal(r.citations[0].excerpt, 'Synthetic Café ＡＧＥ café.');
});
test('case-scoped citations reject foreign IDs, missing provenance and hostile accessors without executing them', async () => {
  const a = await workspace('Synthetic local retirement evidence.', 'case-a'), b = await workspace('Foreign mortality evidence.', 'case-b');
  assert.equal(retrieveQuestionEvidence(a, 'mortality').status, 'insufficient-evidence');
  const foreign = clone(a); foreign.sources[0].records[0].sourceId = b.sources[0].id;
  assert.throws(() => retrieveQuestionEvidence(foreign, 'retirement'), /blocked/);
  const wrongCase = clone(a); wrongCase.sources[0].caseId = 'case-b'; assert.throws(() => retrieveQuestionEvidence(wrongCase, 'retirement'), /different case/);
  const missing = clone(a); delete missing.sources[0].hash; assert.throws(() => retrieveQuestionEvidence(missing, 'retirement'), /blocked/);
  let executed = false; const hostile = clone(a); Object.defineProperty(hostile.sources[0].records[0], 'text', { get() { executed = true; return 'hostile'; } });
  assert.throws(() => retrieveQuestionEvidence(hostile, 'anything'), /accessors/); assert.equal(executed, false);
  const options = {}; Object.defineProperty(options, 'limit', { get() { executed = true; return 5; } }); assert.throws(() => retrieveQuestionEvidence(a, 'retirement', options), /data limit/); assert.equal(executed, false);
  const proto = JSON.parse('{"__proto__":{"polluted":true}}'); const injected = { ...a, injected: proto }; assert.throws(() => retrieveQuestionEvidence(injected, 'retirement'), /Unsafe/); assert.equal({}.polluted, undefined);
});
test('hostile query and imported markup remain inert literal data, never instructions or generated facts', async () => {
  const c = await workspace('<script>globalThis.questionPwned=true</script> Synthetic retirement evidence.');
  const r = retrieveQuestionEvidence(c, '<script>globalThis.questionPwned=true</script> retirement');
  assert.equal(globalThis.questionPwned, undefined); assert.equal(r.citations[0].excerpt, c.sources[0].records[0].text); assert.equal(r.modelUsed, false);
  assert.match(r.notice, /No authority/);
});
test('empty source cases abstain and negation remains meaningful instead of broadening a question', async () => {
  const c = await workspace('Synthetic normal retirement age is 65.');
  const r = retrieveQuestionEvidence(c, 'Is normal retirement age not 65?');
  assert.equal(r.status, 'partial-evidence'); assert.deepEqual(r.missingTerms, ['not']);
  const empty = { ...c, sources: [] };
  assert.equal(retrieveQuestionEvidence(empty, 'normal retirement').status, 'insufficient-evidence');
  assert.deepEqual(retrieveQuestionEvidence(empty, 'normal retirement').citations, []);
});
test('query, meaningful term, citation, record and aggregate budgets fail closed', async () => {
  const c = await workspace('Synthetic ordinary evidence.');
  assert.throws(() => retrieveQuestionEvidence(c, 'x'.repeat(questionRetrievalLimits.queryChars + 1)), /1024/);
  assert.throws(() => retrieveQuestionEvidence(c, Array.from({ length: 33 }, (_, i) => 'term' + i).join(' ')), /32 meaningful/);
  for (const options of [{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { limit: '2' }, { semantic: true }, []]) assert.throws(() => retrieveQuestionEvidence(c, 'ordinary', options));
  const big = clone(c); big.sources[0].records[0].text = 'x'.repeat(questionRetrievalLimits.recordChars + 1); assert.throws(() => retrieveQuestionEvidence(big, 'ordinary'), /text limit/);
  const aggregate = clone(c); aggregate.sources[0].records = Array.from({ length: 65 }, (_, i) => ({ ...aggregate.sources[0].records[0], id: aggregate.sources[0].id + ':' + (i + 1), text: 'x'.repeat(questionRetrievalLimits.recordChars) }));
  assert.throws(() => retrieveQuestionEvidence(aggregate, 'ordinary'), /text limit/);
  const cyclic = clone(c); cyclic.loop = cyclic; assert.throws(() => retrieveQuestionEvidence(cyclic, 'ordinary'), /cyclic/);
});
