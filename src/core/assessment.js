import { extractDemoModel, EXTRACTION_NOTICE } from './demo-adapter.js';
import { evaluateAssessment } from './evaluator.js';

/** @typedef {import('./models').Assessment} Assessment */
/** @typedef {import('./models').Project} Project */
/** @typedef {import('./models').Equipment} Equipment */
/** @typedef {import('./models').Decision} Decision */
/** @typedef {import('./models').AuditEvent} AuditEvent */
export const WORKSPACE_KEY = 'maeyar-workspace-v2';
const STAGES = ['project', 'upload', 'ready', 'review', 'completed'];

function now() { return new Date().toISOString(); }
function uid() { return crypto.randomUUID(); }
/** @param {string} action @param {string} detail @param {string} [actor] @returns {AuditEvent} */
function event(action, detail, actor = 'System / النظام') {
  return { id: uid(), timestamp: now(), action, actor, detail };
}
/** @param {Assessment} assessment @param {string} action @param {string} detail @param {string} [actor] */
function changed(assessment, action, detail, actor) {
  const a = structuredClone(assessment);
  a.updatedAt = now(); a.dirty = true; a.report = null;
  a.audit.push(event(action, detail, actor));
  return a;
}

/** @param {{demo?:boolean}} [options] @returns {Assessment} */
export function createAssessment({ demo = false } = {}) {
  const timestamp = now();
  return {
    id: `MAE-${uid()}`, demo, createdAt: timestamp, updatedAt: timestamp,
    project: { name: '', city: '', buildingType: '', revision: '', client: '', reviewer: '', license: '' },
    drawing: null, equipment: [], connections: [], calculations: [], findings: [], checks: [],
    comments: [], audit: [event('assessment.created', demo ? 'Isolated presentation assessment' : 'Clean assessment created')],
    signoff: null, report: null, stage: 'project', progress: 0, dirty: false
  };
}

/** @param {Assessment} assessment @param {Partial<Project>} project */
export function setProject(assessment, project) {
  if (assessment.stage !== 'project' && assessment.stage !== 'upload') throw new Error('Start a new assessment to change project metadata / ابدأ تقييمًا جديدًا');
  const p = { ...assessment.project, ...project };
  if (!p.name.trim() || !p.city.trim() || !p.revision.trim()) throw new Error('Project name, city and revision are required / اسم المشروع والمدينة والإصدار مطلوبة');
  for (const key of ['baselineMinutes', 'reviewMinutes']) {
    const value = p[/** @type {'baselineMinutes'|'reviewMinutes'} */(key)];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Review times must be valid non-negative numbers');
  }
  const a = changed(assessment, 'project.saved', `${p.name} · ${p.city} · ${p.revision}`);
  a.project = p; a.stage = 'upload'; a.progress = 15;
  return a;
}

/** @param {Assessment} assessment @param {{name:string,size:number,type:string}} drawing */
export function attachDrawing(assessment, drawing) {
  if (!['upload', 'ready'].includes(assessment.stage)) throw new Error('Save project information before uploading / احفظ بيانات المشروع أولًا');
  if (!/\.(pdf|dwg|dxf)$/i.test(drawing.name)) throw new Error('Supported formats: PDF, DWG, DXF / الصيغ المدعومة PDF وDWG وDXF');
  if (!Number.isFinite(drawing.size) || drawing.size <= 0 || drawing.size > 20 * 1024 * 1024) throw new Error('Choose a non-empty drawing up to 20 MB / اختر ملفًا غير فارغ لا يتجاوز 20 ميجابايت');
  const a = changed(assessment, 'drawing.attached', `${drawing.name} · ${drawing.size} bytes · demo adapter`);
  a.drawing = { ...drawing, adapter: 'demo', evidenceLabel: EXTRACTION_NOTICE };
  a.stage = 'ready'; a.progress = 25;
  return a;
}

/** Synchronous sample adapter; UI owns cancellable delay and single-flight guard.
 * @param {Assessment} assessment */
export function analyzeAssessment(assessment) {
  if (assessment.stage !== 'ready' || !assessment.drawing) throw new Error('A drawing is required before analysis / يلزم رفع مخطط قبل التحليل');
  const a = changed(assessment, 'analysis.demo-extraction', EXTRACTION_NOTICE);
  const extracted = extractDemoModel();
  a.equipment = extracted.equipment; a.connections = extracted.connections;
  Object.assign(a, evaluateAssessment(a));
  a.audit.push(event('rules.evaluated', `${a.checks.length} deterministic check instances; ${a.findings.length} findings; unverified demo rules`));
  a.stage = 'review'; a.progress = 75;
  return a;
}

/** @param {Assessment} assessment @param {string} equipmentId @param {Partial<Equipment>} changes */
export function updateEquipment(assessment, equipmentId, changes) {
  if (assessment.stage !== 'review') throw new Error('Equipment can be edited only during review / التعديل أثناء المراجعة فقط');
  const index = assessment.equipment.findIndex(e => e.id === equipmentId);
  if (index === -1) throw new Error('Equipment not found');
  if ('id' in changes && changes.id !== equipmentId) throw new Error('Stable equipment ID cannot be changed');
  const a = changed(assessment, 'equipment.corrected', `${equipmentId}: ${JSON.stringify(changes)}`, assessment.project.reviewer || 'Engineer / المهندس');
  a.equipment[index] = { ...a.equipment[index], ...changes, id: equipmentId };
  Object.assign(a, evaluateAssessment(a)); // validation occurs before new state is returned
  a.signoff = null; a.progress = reviewProgress(a);
  a.audit.push(event('rules.reevaluated', 'All checks re-evaluated; changed evidence decisions reset to pending'));
  return a;
}

/** @param {Assessment} assessment */
function reviewProgress(assessment) {
  const count = assessment.findings.length;
  return count ? 75 + Math.floor(20 * assessment.findings.filter(f => f.decision !== 'pending').length / count) : 95;
}

/** @param {Assessment} assessment @param {string} findingId
 * @param {{decision:Exclude<Decision,'pending'>,comment:string,reviewer:string}} review */
export function reviewFinding(assessment, findingId, review) {
  if (assessment.stage !== 'review') throw new Error('Assessment is not under review');
  if (!['accepted', 'rejected', 'resolved'].includes(review.decision)) throw new Error('Invalid review decision');
  if (!review.reviewer.trim() || !review.comment.trim()) throw new Error('Reviewer and decision rationale are required / اسم المراجع ومبرر القرار مطلوبان');
  const a = changed(assessment, 'finding.decided', `${findingId}: ${review.decision} — ${review.comment}`, review.reviewer);
  const f = a.findings.find(f => f.id === findingId);
  if (!f) throw new Error('Finding not found');
  f.decision = review.decision; f.comment = review.comment.trim(); f.reviewer = review.reviewer.trim(); f.reviewedAt = now();
  a.comments.push({ id: uid(), findingId, comment: review.comment.trim(), reviewer: review.reviewer.trim(), timestamp: f.reviewedAt });
  a.signoff = null; a.progress = reviewProgress(a);
  return a;
}

/** @param {Assessment} assessment @param {string} findingId @param {{comment:string,reviewer:string}} note */
export function addComment(assessment, findingId, note) {
  if (assessment.stage !== 'review') throw new Error('Comments require an assessment under review');
  if (!note.comment.trim() || !note.reviewer.trim()) throw new Error('Reviewer and comment required / المراجع والتعليق مطلوبان');
  if (!assessment.findings.some(f => f.id === findingId)) throw new Error('Finding not found');
  const a = changed(assessment, 'finding.comment', `${findingId}: ${note.comment}`, note.reviewer);
  a.comments.push({ id: uid(), findingId, comment: note.comment.trim(), reviewer: note.reviewer.trim(), timestamp: now() });
  return a;
}

/** Records a self-declared engineer review, NOT authenticated digital design approval.
 * @param {Assessment} assessment @param {{reviewer:string,license:string,comment:string}} signoff */
export function signOff(assessment, signoff) {
  if (assessment.stage !== 'review' || !assessment.equipment.length) throw new Error('Run analysis before sign-off');
  if (assessment.findings.some(f => f.decision === 'pending')) throw new Error('Every finding needs an engineer decision / يجب اتخاذ قرار لكل ملاحظة');
  if (!signoff.reviewer.trim() || !signoff.license.trim() || !signoff.comment.trim()) throw new Error('Reviewer, license and review statement are required / اسم المراجع والترخيص وبيان المراجعة مطلوبة');
  const a = changed(assessment, 'engineer.review-signed', signoff.comment, signoff.reviewer);
  a.signoff = {
    ...signoff, timestamp: now(),
    statement: 'Engineer review recorded, not independent AI approval, statutory design approval or cryptographic signature. Outstanding failures remain visible. / تم تسجيل مراجعة المهندس ولا يمثل ذلك اعتمادًا آليًا أو نظاميًا للتصميم أو توقيعًا رقميًا موثقًا؛ تبقى المخالفات ظاهرة.'
  };
  a.stage = 'completed'; a.progress = 100; a.dirty = false;
  return a;
}

/** Reset retains completed genuine records only; all active/report/transient data is fresh.
 * @param {Assessment} previous @param {Assessment[]} [history] */
export function newAssessment(previous, history = []) {
  const completed = history.filter(a => !a.demo && a.stage === 'completed' && a.signoff);
  if (!previous.demo && previous.stage === 'completed' && previous.signoff && !completed.some(a => a.id === previous.id)) {
    completed.push(structuredClone(previous));
  }
  return { assessment: createAssessment(), history: structuredClone(completed) };
}

export function demoAssessment() {
  let a = createAssessment({ demo: true });
  a = setProject(a, { name: 'برج الأعمال — Business Tower', city: 'الرياض — Riyadh', buildingType: 'Commercial / تجاري', revision: 'Rev.03', client: 'Demo client / عميل تجريبي', reviewer: 'Presentation engineer / مهندس العرض', license: 'DEMO-NOT-VERIFIED' });
  a = attachDrawing(a, { name: 'Maeyar-Sample-E-001.pdf', size: 180000, type: 'application/pdf' });
  return analyzeAssessment(a);
}

/** Genuine aggregate metrics only. No fabricated review-time reduction.
 * @param {Assessment[]} assessments */
export function dashboardStats(assessments) {
  const unique = [...new Map(assessments.filter(a => !a.demo && a.project.name).map(a => [a.id, a])).values()];
  const findings = unique.flatMap(a => a.findings);
  const paired = unique.filter(a => a.stage === 'completed' && Number(a.project.baselineMinutes) > 0 && a.project.reviewMinutes !== undefined);
  const baseline = paired.reduce((s, a) => s + Number(a.project.baselineMinutes), 0);
  const actual = paired.reduce((s, a) => s + Number(a.project.reviewMinutes), 0);
  return {
    total: unique.length, inProgress: unique.filter(a => a.stage !== 'completed').length,
    passed: unique.reduce((s, a) => s + a.checks.filter(c => c.result === 'pass').length, 0),
    warnings: findings.filter(f => f.severity === 'Major' || f.severity === 'Minor').length,
    critical: findings.filter(f => f.severity === 'Critical').length,
    pending: findings.filter(f => f.decision === 'pending').length,
    timeReduction: baseline ? (baseline - actual) / baseline * 100 : null
  };
}

/** @param {Storage} storage @param {Assessment} assessment @param {Assessment[]} history */
export function persistWorkspace(storage, assessment, history) {
  if (assessment.demo) return;
  const complete = history.filter(a => !a.demo && a.stage === 'completed' && a.signoff);
  storage.setItem(WORKSPACE_KEY, JSON.stringify({ schema: 2, assessment, history: complete }));
  // Remove obsolete flags that used to restore unrelated sample results.
  storage.removeItem('maeyar-assessment');
}

/** Validate persisted model instead of silently restoring old sample data.
 * @param {unknown} candidate @returns {candidate is Assessment} */
function validAssessment(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const a = /** @type {Assessment} */ (candidate);
  return typeof a.id === 'string' && !a.demo && !!a.project && typeof a.project.name === 'string' &&
    STAGES.includes(a.stage) && Number.isFinite(a.progress) &&
    ['equipment', 'connections', 'calculations', 'findings', 'checks', 'comments', 'audit'].every(k => Array.isArray(a[/** @type {keyof Assessment} */(k)]));
}

/** @param {Storage} storage @returns {{assessment:Assessment,history:Assessment[]}} */
export function restoreWorkspace(storage) {
  const raw = storage.getItem(WORKSPACE_KEY);
  if (!raw) return { assessment: createAssessment(), history: [] };
  let saved;
  try { saved = JSON.parse(raw); } catch { throw new Error('Saved workspace is corrupted. Export/clear local browser data to recover. / بيانات المتصفح تالفة؛ امسحها للبدء من جديد.'); }
  if (saved.schema !== 2 || !validAssessment(saved.assessment) || !Array.isArray(saved.history) ||
      !saved.history.every(a => validAssessment(a) && a.stage === 'completed' && a.signoff)) {
    throw new Error('Saved workspace format is invalid; recovery requires starting a clean workspace / صيغة البيانات المحفوظة غير صحيحة');
  }
  return { assessment: saved.assessment, history: saved.history };
}