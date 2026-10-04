/** @typedef {import('./models').Equipment} Equipment */
/** @typedef {import('./models').Calculation} Calculation */

/** @param {number} value @param {string} label @param {boolean} [zeroAllowed] */
function positive(value, label, zeroAllowed = false) {
  if (!Number.isFinite(value) || (zeroAllowed ? value < 0 : value <= 0)) {
    throw new Error(`${label}: enter a finite ${zeroAllowed ? 'non-negative' : 'positive'} number / أدخل قيمة صحيحة`);
  }
  return value;
}

/** Reproducible balanced three-phase current; load is active kW, not kVA.
 * @param {number} loadKW @param {number} [voltage] @param {number} [powerFactor] */
export function threePhaseCurrent(loadKW, voltage = 400, powerFactor = 0.9) {
  positive(loadKW, 'Load', true); positive(voltage, 'Voltage'); positive(powerFactor, 'Power factor');
  if (powerFactor > 1) throw new Error('Power factor must be <= 1 / معامل القدرة يجب ألا يتجاوز 1');
  return loadKW * 1000 / (Math.sqrt(3) * voltage * powerFactor);
}

/** @param {Equipment} equipment @returns {Calculation} */
export function calculateEquipment(equipment) {
  const e = equipment;
  const currentA = threePhaseCurrent(e.loadKW, e.voltage, e.powerFactor);
  positive(e.lengthM, 'Length', true); positive(e.cableMM2, 'Cable section');
  positive(e.breakerA, 'Breaker'); positive(e.ampacityA, 'Ampacity'); positive(e.deratingFactor, 'Derating');
  if (e.deratingFactor > 1) throw new Error('Derating factor must be <= 1 / معامل التخفيض يجب ألا يتجاوز 1');
  if (!Array.isArray(e.phaseLoadsKW) || e.phaseLoadsKW.length !== 3) throw new Error('Three phase loads are required');
  e.phaseLoadsKW.forEach(v => positive(v, 'Phase load', true));
  // Resistive copper approximation, not a substitute for licensed installation tables.
  // ΔV = √3 I L (ρ/S) cosφ; reactance omitted and explicitly declared.
  const voltageDropPct = Math.sqrt(3) * currentA * e.lengthM * (0.0225 / e.cableMM2) * e.powerFactor / e.voltage * 100;
  return {
    equipmentId: e.id, currentA, voltageDropPct, correctedAmpacityA: e.ampacityA * e.deratingFactor,
    formula: `Ib = ${e.loadKW} × 1000 / (√3 × ${e.voltage} × ${e.powerFactor}) = ${currentA.toFixed(2)} A`,
    voltageDropFormula: `ΔV% = √3 × ${currentA.toFixed(4)} × ${e.lengthM} × (0.0225 / ${e.cableMM2}) × ${e.powerFactor} / ${e.voltage} × 100 = ${voltageDropPct.toFixed(3)}%`,
    assumptions: 'Balanced 3-phase, copper ρ=0.0225 Ω·mm²/m (illustrative temperature-adjusted value), reactance omitted; ampacity supplied as demo input; installation, grouping and thermal conditions require engineer validation. / ثلاثي الطور متوازن، قيم تجريبية تحتاج تحقق المهندس.'
  };
}

/** @param {Equipment[]} equipment @param {number} [demandFactor] */
export function loadSummary(equipment, demandFactor = 0.72) {
  positive(demandFactor, 'Demand factor');
  if (demandFactor > 1) throw new Error('Demand factor must be <= 1');
  const connectedKW = equipment.reduce((sum, e) => sum + positive(e.loadKW, 'Load', true), 0);
  return { connectedKW, demandKW: connectedKW * demandFactor, demandFactor };
}