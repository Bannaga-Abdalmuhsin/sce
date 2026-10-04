import test from 'node:test';
import assert from 'node:assert/strict';
import { threePhaseCurrent, calculateEquipment, loadSummary } from '../src/core/calculations.js';
import { demoAssessment } from '../src/core/assessment.js';

test('82 kW three-phase current is explainable and approximately 131.5 A', () => {
  assert.ok(Math.abs(threePhaseCurrent(82, 400, .9) - 131.51) < 0.02);
  const assessment = demoAssessment();
  const eq = assessment.equipment.find(item => item.id === 'DB-HVAC');
  const calc = assessment.calculations.find(item => item.equipmentId === 'DB-HVAC');
  assert.ok(eq && calc);
  assert.equal(eq.breakerA, 125);
  assert.ok(calc.currentA > 131 && calc.currentA < 132);
  assert.match(calc.formula, /131\.51/);
  assert.match(calc.assumptions, /reactance omitted/i);
  assert.ok(calc.voltageDropPct > 0);
});

test('input validation rejects physically invalid ranges rather than silently substituting', () => {
  assert.throws(() => threePhaseCurrent(-10), /Load/);
  assert.throws(() => threePhaseCurrent(10, 400, 1.1), /Power factor/);
  assert.throws(() => threePhaseCurrent(10, 0), /Voltage/);
  const assessment = demoAssessment();
  const invalid = { ...assessment.equipment[0], deratingFactor: 1.2 };
  assert.throws(() => calculateEquipment(invalid), /Derating/);
});

test('connected and demand load aggregation remains deterministic', () => {
  const { equipment } = demoAssessment();
  const result = loadSummary(equipment, .72);
  assert.equal(result.connectedKW, 229);
  assert.equal(result.demandKW, 164.88);
  assert.equal(result.demandFactor, .72);
  assert.throws(() => loadSummary(equipment, 2), /Demand factor/);
});