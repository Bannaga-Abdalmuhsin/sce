import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssessment, setProject, attachDrawing, analyzeAssessment, updateEquipment,
  reviewFinding, addComment, signOff, newAssessment, persistWorkspace, restoreWorkspace,
  dashboardStats, WORKSPACE_KEY, demoAssessment
} from '../src/core/assessment.js';

function prepared() {
  let a = createAssessment();
  a = setProject(a, { name: 'Test tower', city: 'Riyadh', buildingType: 'Commercial', revision: 'R1', client: 'Test client', reviewer: 'Engineer A', license: 'DEMO-1' });
  a = attachDrawing(a, { name: 'drawing.pdf', type: 'application/pdf', size: 4096 });
  return a;
}
function MemoryStorage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key)
  };
}

test('new assessment resets every previous state and retains only completed genuine history', () => {
  const old = analyzeAssessment(prepared());
  old.comments.push({ id: 'C1', findingId: old.findings[0].id, comment: 'old', reviewer: 'A', timestamp: new Date().toISOString() });
  old.report = { stale: true };
  const first = newAssessment(old, []);
  const fresh = first.assessment;
  assert.notEqual(fresh.id, old.id);
  assert.equal(fresh.stage, 'project');
  assert.equal(fresh.progress, 0);
  assert.equal(fresh.dirty, false);
  assert.equal(fresh.drawing, null);
  assert.deepEqual(fresh.project.name, '');
  assert.deepEqual(fresh.equipment, []);
  assert.deepEqual(fresh.calculations, []);
  assert.deepEqual(fresh.findings, []);
  assert.deepEqual(fresh.comments, []);
  assert.equal(fresh.report, null);
  assert.deepEqual(first.history, []);

  let complete = analyzeAssessment(prepared());
  for (const finding of [...complete.findings]) {
    complete = reviewFinding(complete, finding.id, { decision: 'accepted', comment: 'Engineer reviewed; sample only', reviewer: 'Engineer A' });
  }
  complete = signOff(complete, { reviewer: 'Engineer A', license: 'DEMO-1', comment: 'Review recorded, no design approval' });
  const second = newAssessment(complete, []);
  assert.equal(second.history.length, 1);
  assert.equal(second.history[0].id, complete.id);
  assert.equal(second.assessment.stage, 'project');
  assert.equal(second.assessment.progress, 0);
  assert.notEqual(second.assessment.id, complete.id);
});

test('only a changed evidence fingerprint resets an old reviewer decision', () => {
  let a = analyzeAssessment(prepared());
  const original = a.findings.find(f => f.equipmentId === 'DB-HVAC' && f.ruleId === 'SBC401-OCP-07');
  assert.ok(original);
  a = reviewFinding(a, original.id, { decision: 'accepted', comment: 'Checked', reviewer: 'Engineer A' });
  const unchanged = updateEquipment(a, 'DB-L1', { loadKW: 46, phaseLoadsKW: [15.34, 15.33, 15.33] });
  assert.equal(unchanged.findings.find(f => f.id === original.id).decision, 'accepted');
  const changed = updateEquipment(unchanged, 'DB-HVAC', { breakerA: 100 });
  const revised = changed.findings.find(f => f.equipmentId === 'DB-HVAC' && f.ruleId === 'SBC401-OCP-07');
  assert.ok(revised);
  assert.equal(revised.decision, 'pending');
  assert.equal(revised.reviewer, '');
  assert.equal(changed.signoff, null);
});

test('decision audit and comment are attributed; signoff requires every decision', () => {
  let a = analyzeAssessment(prepared());
  assert.throws(() => signOff(a, { reviewer: 'Engineer A', license: 'D1', comment: 'reviewed' }), /Every finding/);
  const f = a.findings[0];
  assert.throws(() => reviewFinding(a, f.id, { decision: 'accepted', comment: '', reviewer: 'Engineer A' }), /rationale/);
  a = addComment(a, f.id, { comment: 'Please confirm installation method', reviewer: 'Engineer A' });
  assert.equal(a.comments.at(-1).findingId, f.id);
  for (const finding of [...a.findings]) {
    if (finding.decision === 'pending') a = reviewFinding(a, finding.id, { decision: 'rejected', comment: 'Disposition documented; still verify evidence', reviewer: 'Engineer A' });
  }
  a = signOff(a, { reviewer: 'Engineer A', license: 'D1', comment: 'Review complete only' });
  assert.equal(a.stage, 'completed');
  assert.equal(a.progress, 100);
  assert.match(a.signoff.statement, /not independent AI approval/i);
  assert.ok(a.audit.some(event => event.action === 'engineer.review-signed' && event.actor === 'Engineer A'));
});

test('persistence recovers only versioned current state and leaves presentation data out', () => {
  const storage = MemoryStorage();
  const active = analyzeAssessment(prepared());
  persistWorkspace(storage, active, []);
  assert.equal(storage.getItem('maeyar-assessment'), null);
  const restored = restoreWorkspace(storage);
  assert.equal(restored.assessment.id, active.id);
  assert.equal(restored.assessment.findings.length, active.findings.length);
  const demo = demoAssessment();
  const before = storage.getItem(WORKSPACE_KEY);
  persistWorkspace(storage, demo, []);
  assert.equal(storage.getItem(WORKSPACE_KEY), before);
  storage.setItem(WORKSPACE_KEY, '{bad');
  assert.throws(() => restoreWorkspace(storage), /corrupted/);
});

test('invalid drawing types, oversized uploads and stale analysis fail explicitly', () => {
  const project = setProject(createAssessment(), { name: 'Test', city: 'Riyadh', revision: 'R1' });
  assert.throws(() => attachDrawing(project, { name: 'drawing.png', type: 'image/png', size: 5 }), /Supported formats/);
  assert.throws(() => attachDrawing(project, { name: 'large.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }), /20 MB/);
  assert.throws(() => analyzeAssessment(project), /drawing is required/);
});

test('dashboard reports measured time only from completed assessments with a defined baseline', () => {
  let a = analyzeAssessment(prepared());
  assert.equal(dashboardStats([a]).timeReduction, null);
  a.project.baselineMinutes = 120;
  a.project.reviewMinutes = 90;
  for (const f of [...a.findings]) a = reviewFinding(a, f.id, { decision: 'accepted', comment: 'reviewed', reviewer: 'Engineer A' });
  a = signOff(a, { reviewer: 'Engineer A', license: 'D1', comment: 'reviewed' });
  assert.equal(dashboardStats([a]).timeReduction, 25);
});