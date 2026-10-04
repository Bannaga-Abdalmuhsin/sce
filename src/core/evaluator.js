import { calculateEquipment, loadSummary, threePhaseCurrent } from './calculations.js';
import { RULES } from './rules.js';

/** @typedef {import('./models').Assessment} Assessment */
/** @typedef {import('./models').Finding} Finding */
/** @typedef {import('./models').Check} Check */

/** Pure, repeatable evaluator. Decisions survive only when their full evidence fingerprint is unchanged.
 * @param {Assessment} assessment */
export function evaluateAssessment(assessment) {
  const calculations = assessment.equipment.map(calculateEquipment);
  /** @type {Finding[]} */ const findings = [];
  /** @type {Check[]} */ const checks = [];
  /** @param {string} ruleId @param {string} equipmentId @param {'pass'|'fail'|'review'} result
   * @param {string} value @param {string} expected @param {string} calculation */
  function check(ruleId, equipmentId, result, value, expected, calculation) {
    const r = RULES.find(r => r.id === ruleId);
    if (!r || !r.active) return;
    checks.push({ ruleId, equipmentId, result, detail: `${value} → ${expected}` });
    if (result === 'pass') return;
    const eq = assessment.equipment.find(e => e.id === equipmentId);
    const id = `F-${ruleId}-${equipmentId}`;
    const drawing = `${assessment.drawing?.name ?? 'No drawing'} · ${eq?.location ?? 'Project metadata'} · SAMPLE EVIDENCE (not extracted)`;
    const fingerprint = JSON.stringify([ruleId, r.version, equipmentId, value, expected, calculation, drawing]);
    const previous = assessment.findings.find(f => f.id === id && f.fingerprint === fingerprint);
    findings.push({
      id, severity: r.severity, title: r.title, equipmentId, location: eq?.location ?? 'Project metadata',
      extractedValue: value, expectedRequirement: expected, calculation, ruleId, ruleVersion: r.version,
      confidence: eq?.confidence ?? 1, recommendedAction: r.action,
      evidence: { drawing, extracted: value, calculation, rule: `${r.id} · ${r.version} · ${r.clause}`, finding: r.title.en, correctiveAction: r.action.en },
      decision: previous?.decision ?? 'pending', comment: previous?.comment ?? '', reviewer: previous?.reviewer ?? '',
      reviewedAt: previous?.reviewedAt ?? null, fingerprint
    });
  }
  assessment.equipment.forEach((e, i) => {
    const c = calculations[i];
    check('SBC401-CUR-01', e.id, 'pass', `${c.currentA.toFixed(2)} A`, 'Valid balanced three-phase current', c.formula);
    check('SBC401-OCP-07', e.id, c.currentA <= e.breakerA ? 'pass' : 'fail',
      `P=${e.loadKW} kW; V=${e.voltage} V; cosφ=${e.powerFactor}; In=${e.breakerA} A`,
      `Ib ≤ In; calculated ${c.currentA.toFixed(2)} A ≤ ${e.breakerA} A`, c.formula);
    check('IEC60364-AMP-02', e.id, c.currentA <= c.correctedAmpacityA && e.breakerA <= c.correctedAmpacityA ? 'pass' : 'fail',
      `Table ampacity=${e.ampacityA} A; factor=${e.deratingFactor}; In=${e.breakerA} A`,
      'Ib ≤ In ≤ corrected Iz',
      `Iz=${e.ampacityA}×${e.deratingFactor}=${c.correctedAmpacityA.toFixed(2)} A; Ib=${c.currentA.toFixed(2)} A`);
    check('PROJECT-VD-01', e.id, c.voltageDropPct <= 3 ? 'pass' : 'fail',
      `L=${e.lengthM} m; S=${e.cableMM2} mm²`, 'Illustrative project voltage drop ≤3%', c.voltageDropFormula);
    check('SEC-SC-05', e.id, 'review', `Icu=${e.breakingCapacityKA ?? 'missing'} kA; supply fault level unavailable`,
      'Validated fault study required', 'Not calculated: fault level, clearing time and cable withstand coefficient unavailable');
    check('SBC401-GND-02', e.id, e.earthing ? 'pass' : 'fail', `Earthing data=${e.earthing ? 'present' : 'missing'}`,
      'Protective conductor and bonding information present', 'Presence check only; not protective disconnection validation');
    check('SEC-RATING-01', e.id, e.breakingCapacityKA !== null && e.breakingCapacityKA > 0 ? 'pass' : 'fail',
      `Breaking capacity=${e.breakingCapacityKA ?? 'missing'} kA`, 'Verified positive breaking capacity stated', 'Required equipment-rating completeness check');
    const unique = assessment.equipment.filter(x => x.label === e.label).length === 1;
    check('PROJECT-LABEL-01', e.id, e.label === e.drawingLabel && unique ? 'pass' : 'fail',
      `Schedule=${e.label}; drawing=${e.drawingLabel}; unique=${unique}`, 'Matching, unique equipment identifiers', 'Exact normalized label comparison');
    const mean = e.phaseLoadsKW.reduce((a, b) => a + b, 0) / 3;
    const spread = mean === 0 ? 0 : (Math.max(...e.phaseLoadsKW) - Math.min(...e.phaseLoadsKW)) / mean * 100;
    check('IEC-BAL-01', e.id, spread <= 20 ? 'pass' : 'fail', `Phase loads=${e.phaseLoadsKW.join('/')} kW`,
      'Illustrative phase spread ≤20%', `(max-min)/mean×100 = ${spread.toFixed(2)}%`);
  });
  const load = loadSummary(assessment.equipment);
  const demandA = threePhaseCurrent(load.demandKW);
  check('SBC401-LOAD-03', 'MDB-01', demandA <= 250 ? 'pass' : 'fail',
    `Connected=${load.connectedKW} kW; demand factor=${load.demandFactor}; main breaker=250 A (demo)`,
    'Main breaker ≥ demand current', `Pd=${load.connectedKW}×${load.demandFactor}=${load.demandKW.toFixed(2)} kW; Id=${demandA.toFixed(2)} A`);
  const missing = ['name', 'city', 'revision', 'client'].filter(k => !String(assessment.project[/** @type {keyof import('./models').Project} */(k)] ?? '').trim());
  if (!assessment.drawing?.name) missing.push('drawing');
  check('PROJECT-DOC-01', 'PROJECT', missing.length ? 'fail' : 'pass',
    missing.length ? `Missing: ${missing.join(', ')}` : 'Project metadata complete',
    'Project name, city, client, drawing revision and drawing name required', 'Mandatory metadata presence check');
  const rank = { Critical: 0, Major: 1, Minor: 2, Information: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
  return { calculations, findings, checks };
}