import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReport, escapeHTML } from '../src/core/report.js';
import { demoAssessment, setProject, attachDrawing, analyzeAssessment, createAssessment } from '../src/core/assessment.js';

test('report requires analyzed assessment and escapes all project supplied markup', () => {
  assert.throws(() => generateReport(createAssessment()), /No current analyzed assessment/);
  let a = createAssessment();
  a = setProject(a, { name: '<script>alert(1)</script>', city: 'Riyadh', revision: 'R1', client: '<b>XSS</b>' });
  a = attachDrawing(a, { name: 'drawing.pdf', size: 1024, type: 'application/pdf' });
  a = analyzeAssessment(a);
  const report = generateReport(a);
  assert.ok(report.startsWith('<!doctype html>'));
  assert.match(report, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(report, /<script>alert\(1\)/);
  assert.match(report, /SBC401-OCP-07/);
  assert.match(report, /131\.51/);
  assert.match(report, /Evidence|evidence/);
  assert.match(report, /Audit trail/);
  assert.match(report, /Engineer sign-off/);
  assert.match(report, /pending validation/);
  assert.match(report, /no independently verified rule pack/);
  assert.equal(escapeHTML(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('demo assessment report identifies sample data and does not label it as extracted drawing content', () => {
  const html = generateReport(demoAssessment());
  assert.match(html, /PRESENTATION ONLY/);
  assert.match(html, /NOT extracted/);
  assert.match(html, /UNSIGNED/);
});