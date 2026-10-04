import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, DEMO_DISCLAIMER, DEMO_DISCLAIMER_AR } from '../src/core/rules.js';
import { demoAssessment } from '../src/core/assessment.js';

test('every modeled electrical finding traces to a versioned unverified metadata record', () => {
  assert.ok(RULES.length >= 10);
  for (const rule of RULES) {
    assert.ok(rule.id && rule.title.en && rule.title.ar && rule.source && rule.version);
    assert.ok(rule.clause && rule.discipline && rule.inputs.length && rule.method && rule.logic);
    assert.ok(rule.severity && rule.action.en && rule.action.ar && rule.effectiveDate);
    assert.ok(rule.verificationStatus.includes('pending validation'));
    assert.ok(rule.history.length && rule.testResult);
  }
  assert.match(DEMO_DISCLAIMER, /pending validation/);
  assert.match(DEMO_DISCLAIMER_AR, /التحقق/);
});

test('rule evaluation is deterministic and flags HVAC protection and cable mismatch', () => {
  const a = demoAssessment();
  const hvac = a.findings.filter(f => f.equipmentId === 'DB-HVAC');
  assert.ok(hvac.some(f => f.ruleId === 'SBC401-OCP-07' && f.severity === 'Critical'));
  assert.ok(hvac.some(f => f.ruleId === 'IEC60364-AMP-02'));
  for (const f of hvac) {
    assert.ok(f.id && f.location && f.extractedValue && f.expectedRequirement && f.calculation);
    assert.ok(f.evidence.drawing && f.evidence.extracted && f.evidence.calculation && f.evidence.rule && f.evidence.correctiveAction);
    assert.ok(f.confidence > 0 && f.confidence <= 1);
  }
  assert.ok(a.checks.some(c => c.ruleId === 'SEC-SC-05' && c.result === 'review'));
  assert.deepEqual(a.findings.map(f => [f.id, f.fingerprint]), demoAssessment().findings.map(f => [f.id, f.fingerprint]));
});