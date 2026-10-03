/** @typedef {import('./models').Equipment} Equipment */
export const EXTRACTION_NOTICE = 'Transparent demo adapter: sample values are NOT extracted from the uploaded drawing. / محاكاة شفافة: القيم من عينة وليست مستخرجة من الملف المرفوع.';

/** Return independent sample records, never mutate shared fixture data.
 * @returns {{equipment:Equipment[],connections:{from:string,to:string}[]}} */
export function extractDemoModel() {
  const raw = [
    { id: 'DB-L1', loadKW: 45, breakerA: 80, cableMM2: 25, ampacityA: 101, lengthM: 42, earthing: true, breakingCapacityKA: 25, phaseLoadsKW: [15, 15, 15] },
    { id: 'DB-P1', loadKW: 68, breakerA: 125, cableMM2: 50, ampacityA: 151, lengthM: 61, earthing: true, breakingCapacityKA: 25, phaseLoadsKW: [29, 22, 17] },
    { id: 'DB-HVAC', loadKW: 82, breakerA: 125, cableMM2: 25, ampacityA: 101, lengthM: 78, earthing: false, breakingCapacityKA: 25, phaseLoadsKW: [27.3, 27.3, 27.4] },
    { id: 'DB-UPS', loadKW: 34, breakerA: 80, cableMM2: 25, ampacityA: 101, lengthM: 88, earthing: true, breakingCapacityKA: null, phaseLoadsKW: [11.3, 11.3, 11.4] }
  ];
  const equipment = raw.map((e, i) => ({
    ...e, label: e.id, drawingLabel: e.id === 'DB-UPS' ? 'UPS-DB' : e.id,
    voltage: 400, powerFactor: 0.9, deratingFactor: 0.9,
    location: `Sample SLD · Sheet E-001 · Grid ${['B2', 'B3', 'B4', 'B5'][i]}`,
    confidence: [0.96, 0.93, 0.97, 0.89][i],
    phaseLoadsKW: /** @type {[number,number,number]} */ (e.phaseLoadsKW)
  }));
  return { equipment, connections: [{ from: 'SEC-SUPPLY', to: 'MDB-01' }, ...equipment.map(e => ({ from: 'MDB-01', to: e.id }))] };
}