/** @typedef {import('./models').Rule} Rule */
/** @typedef {import('./models').Severity} Severity */
export const RULE_PACK_VERSION = '2026.1-demo';
export const DEMO_DISCLAIMER = 'Demo rule – pending validation against the licensed authoritative source.';
export const DEMO_DISCLAIMER_AR = 'قاعدة تجريبية — بانتظار التحقق من المصدر الرسمي المرخّص.';

/** @param {string} id @param {string} en @param {string} ar @param {string} source @param {string} pack
 * @param {string[]} inputs @param {string} method @param {string} logic @param {Severity} severity
 * @param {string} actionEn @param {string} actionAr @returns {Rule} */
function rule(id, en, ar, source, pack, inputs, method, logic, severity, actionEn, actionAr) {
  return {
    id, title: { en, ar }, source, pack, version: RULE_PACK_VERSION,
    edition: source.includes('SBC') ? '2024 (reference only)' : 'Edition to be verified by licensed engineer',
    clause: 'Unassigned — authoritative licensed clause pending validation',
    discipline: 'Electrical', inputs, method, logic, severity, action: { en: actionEn, ar: actionAr },
    effectiveDate: '2026-10-03', verificationStatus: DEMO_DISCLAIMER, active: true,
    history: [{ date: '2026-10-03', change: 'Initial illustrative rule; no copyrighted source text; not approved for production.' }],
    testResult: 'Covered by deterministic automated tests; source validation pending'
  };
}

/** Illustrative governed metadata, NOT reproduced standards or certified limits.
 * @type {Rule[]} */
export const RULES = [
  rule('SBC401-LOAD-03', 'Connected and demand load', 'الحمل المتصل وحمل الطلب', 'SBC 401 — Electrical requirements', 'Saudi Compliance Pack',
    ['loadKW', 'demandFactor', 'mainBreakerA'], 'ΣP; Pd=ΣP×0.72; Id=Pd×1000/(√3×400×0.9)', 'Demo main breaker 250A >= calculated demand current', 'Major',
    'Verify demand factor and main feeder capacity with the licensed source and project schedule.', 'تحقق من عامل الطلب وسعة المغذي الرئيسي وفق المصدر المرخّص وجدول المشروع.'),
  rule('SBC401-CUR-01', 'Three-phase design current', 'تيار التصميم ثلاثي الطور', 'SBC 401 / IEC 60364 principles', 'Saudi Compliance Pack',
    ['loadKW', 'voltage', 'powerFactor'], 'Ib=P×1000/(√3×V×cosφ)', 'Finite current calculated from valid inputs', 'Information',
    'Verify extracted load, voltage and power factor.', 'تحقق من الحمل والجهد ومعامل القدرة المستخرج.'),
  rule('SBC401-OCP-07', 'Protection coordination', 'تنسيق تيار التصميم والقاطع', 'SBC 401 / IEC 60364 principles', 'Saudi Compliance Pack',
    ['currentA', 'breakerA'], 'Compare design current Ib with selected nominal breaker In', 'Ib <= In (demo check; trip characteristics also require review)', 'Critical',
    'Re-select breaker and cable together; verify Ib ≤ In ≤ Iz, trip curves and selectivity.', 'أعد اختيار القاطع والكابل معًا وتحقق من Ib ≤ In ≤ Iz ومنحنيات الفصل والانتقائية.'),
  rule('IEC60364-AMP-02', 'Corrected cable ampacity', 'سعة الكابل المصححة', 'SASO-adopted IEC / IEC 60364 principles', 'International Reference Pack',
    ['ampacityA', 'deratingFactor', 'breakerA', 'currentA'], 'Iz=table ampacity×derating factor', 'Ib <= Iz and In <= Iz using illustrative input ampacity', 'Critical',
    'Confirm licensed ampacity table, installation method, grouping and temperature; resize conductor as needed.', 'أكد جدول السعة المرخّص وطريقة التمديد والتجميع والحرارة ثم أعد تحديد المقطع.'),
  rule('PROJECT-VD-01', 'Voltage-drop project limit', 'حد هبوط الجهد للمشروع', 'Approved project specifications (demo)', 'Project Specifications Pack',
    ['currentA', 'lengthM', 'cableMM2', 'voltage', 'powerFactor'], 'ΔV%=√3×I×L×(ρ/S)×cosφ/V×100; ρ=0.0225; X omitted', 'ΔV <= 3% illustrative project limit, not a quoted code limit', 'Major',
    'Verify route length and impedance; confirm project voltage-drop limit and conductor size.', 'تحقق من طول المسار والممانعة وحد المشروع لهبوط الجهد ومقطع الموصل.'),
  rule('SEC-SC-05', 'Short-circuit withstand — study required', 'تحمل القصر — دراسة مطلوبة', 'Saudi Electricity Company connection/distribution requirements', 'Saudi Compliance Pack',
    ['breakingCapacityKA', 'faultCurrentKA', 'clearingTime', 'cableK'], 'Placeholder: requires fault study; no withstand result calculated', 'Always review; never auto-pass without validated study', 'Information',
    'Obtain supply fault level; verify breaker Icu/Ics and cable I²t withstand with a validated short-circuit study.', 'احصل على مستوى القصر وتحقق من Icu/Ics وتحمل I²t للكابل بدراسة معتمدة.'),
  rule('SBC401-GND-02', 'Earthing and protection completeness', 'اكتمال التأريض والحماية', 'SBC 401 / IEC 60364 principles', 'Saudi Compliance Pack',
    ['earthing', 'PE conductor', 'bonding arrangement'], 'Presence check only; not earth-loop impedance or RCD verification', 'earthing flag present; protective data must be verified', 'Major',
    'Document protective conductor size and bonding arrangement; verify protective disconnection separately.', 'وثق مقطع موصل الحماية والربط وتحقق من الفصل الوقائي بصورة مستقلة.'),
  rule('SEC-RATING-01', 'Missing equipment ratings', 'تصنيفات المعدات الناقصة', 'SEC / approved project specifications', 'Saudi Compliance Pack',
    ['breakerA', 'breakingCapacityKA', 'voltage'], 'Required rating completeness', 'breakingCapacityKA is positive and present', 'Major',
    'Add verified equipment rating and manufacturer reference.', 'أضف تصنيف المعدة الموثق ومرجع الشركة المصنعة.'),
  rule('PROJECT-LABEL-01', 'Equipment label consistency', 'اتساق تسميات المعدات', 'Approved project specifications / client standards', 'Project Specifications Pack',
    ['label', 'drawingLabel', 'equipment ids'], 'Compare labels and uniqueness', 'Labels equal and normalized equipment labels unique', 'Minor',
    'Reconcile drawing and equipment-schedule identifiers.', 'طابق معرفات المخطط وجدول المعدات.'),
  rule('IEC-BAL-01', 'Phase load balance warning', 'تحذير توازن أحمال الأطوار', 'IEC 60364 principles / project specification (demo)', 'International Reference Pack',
    ['phaseLoadsKW'], '(max phase - min phase)/mean phase×100', 'Spread <=20% illustrative project threshold', 'Minor',
    'Redistribute single-phase circuits and confirm phase allocation with the engineer.', 'أعد توزيع دوائر الطور الواحد وأكد تخصيص الأطوار مع المهندس.'),
  rule('PROJECT-DOC-01', 'Mandatory drawing information', 'بيانات المخطط الإلزامية', 'Approved project specifications / client standards', 'Project Specifications Pack',
    ['projectName', 'city', 'revision', 'client', 'drawingName'], 'Drawing/project metadata completeness', 'All required project and drawing metadata present', 'Minor',
    'Complete project, client and drawing revision metadata before review sign-off.', 'أكمل بيانات المشروع والعميل وإصدار المخطط قبل توقيع المراجعة.')
];