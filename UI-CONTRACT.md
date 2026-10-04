# Maeyar implementation contract

Keep the existing static HTML/CSS/JavaScript architecture; no framework migration.
Main agent owns src/core/*, tests/*, scripts/*, package.json, docs and CI.
Design agent owns index.html, styles.css, app.js and optional src/ui/*.
ES modules with relative imports; index.html loads app.js as type=module.

## Core imports (being implemented by main agent)

From ./src/core/assessment.js:
- createAssessment({ demo?: boolean } = {}) => fresh assessment
- setProject(assessment, { name, city, buildingType, revision, client, reviewer, license, baselineMinutes?, reviewMinutes? }) => NEW assessment, stage='upload'
- attachDrawing(assessment, { name, size, type }) => NEW assessment, stage='ready'; errors on unsupported extension or >20MB
- analyzeAssessment(assessment) => NEW assessment populated with transparent demo extraction and deterministic checks; stage='review', progress=75
- updateEquipment(assessment, equipmentId, changes) => NEW assessment with re-evaluated findings and audit log (signoff invalidated)
- reviewFinding(assessment, findingId, { decision:'accepted'|'rejected'|'resolved', comment, reviewer }) => NEW assessment with timestamp and audit; review requires reviewer/comment; rejected means engineer disputes finding, not automatic compliance
- addComment(assessment, findingId, { comment, reviewer }) => NEW assessment with comment and audit without changing decision
- signOff(assessment, { reviewer, license, comment }) => NEW assessment with signoff and stage='completed', progress=100; all findings require a decision, identity required; statement records review NOT design approval
- newAssessment(previous, history) => { assessment:fresh, history }; retains only completed genuine assessments, NEVER presentation data
- demoAssessment() => analyzed isolated sample assessment (demo=true), does not touch storage
- dashboardStats(assessments) => { total, inProgress, passed, warnings, critical, pending, timeReduction:number|null }
- persistWorkspace(storage, assessment, history) => void (never saves demo)
- restoreWorkspace(storage) => { assessment, history }; no old sample auto-restoration
- WORKSPACE_KEY string

Assessment shape: { id, demo, createdAt, updatedAt, project:{...}, drawing:null|{name,size,type,adapter:'demo', evidenceLabel}, equipment:Equipment[], connections:{from,to}[], calculations:Calculation[], findings:Finding[], checks:Check[], comments:Comment[], audit:AuditEvent[], signoff:null|{reviewer,license,comment,timestamp,statement}, report:null, stage:'project'|'upload'|'ready'|'review'|'completed', progress, dirty }
Equipment: { id,label,drawingLabel,loadKW,voltage,powerFactor,lengthM,cableMM2,breakerA,ampacityA,deratingFactor,earthing,breakingCapacityKA,phaseLoadsKW:[number,number,number],location,confidence }
Calculation: { equipmentId,currentA,voltageDropPct,correctedAmpacityA,formula,voltageDropFormula,assumptions }
Finding: { id,severity:'Critical'|'Major'|'Minor'|'Information',title:{en,ar},equipmentId,location,extractedValue,expectedRequirement,calculation,ruleId,ruleVersion,confidence,recommendedAction:{en,ar},evidence:{drawing,extracted,calculation,rule,finding,correctiveAction},decision:'pending'|'accepted'|'rejected'|'resolved',comment,reviewer,reviewedAt, fingerprint }
Check: { ruleId,equipmentId,result:'pass'|'fail'|'review',detail }
AuditEvent: { id,timestamp,action,actor,detail }

From ./src/core/rules.js:
- RULES: structured bilingual metadata array { id,title:{en,ar},pack,version,source,edition,clause,discipline,inputs:string[],method,logic,severity,action:{en,ar},effectiveDate,verificationStatus,active,history:{date,change}[],testResult }
- RULE_PACK_VERSION; DEMO_DISCLAIMER

From ./src/core/report.js:
- generateReport(assessment) => self-contained bilingual HTML string; throws before analysis; escape all user data. Includes full evidence, audit, signoff, limitations.
- downloadReport(assessment) => browser downloads HTML report (dynamic import only when requested)

From ./src/core/calculations.js:
- threePhaseCurrent(loadKW, voltage=400, powerFactor=.9)
- calculateEquipment(equipment)
- loadSummary(equipment, demandFactor=.72) => { connectedKW,demandKW,demandFactor }

PDF preview use object URL for selected local PDF, revoke on reset/replace; never fake display of uploaded DWG/DXF. DWG/DXF show metadata and separate demo SLD. Raw upload bytes remain browser-only, not persisted; after refresh require reupload to preview. Analysis explicitly ALWAYS sample data independent of uploaded file; no live AI claim.

## UI responsibilities

End-to-end: project form -> upload -> run demo extraction -> normalized SLD + editable equipment/calculations -> traceable findings with accept/reject/resolve/comment -> licensed-engineer review signoff -> bilingual report + audit + completed history.
Dashboard, Workspace, Findings, Rule library, Reports/Audit, About/Pilot all working hash navigation.
Presentation mode temporary isolated assessment, guided <=3min steps with Next and Restart, highlight DB-HVAC 82kW =>131.5A >125A. Exit restores genuine workspace without saving demo.
Use explicit Arabic/English dictionaries and lang/dir, not DOM text walkers. Provide fully translated controls, status labels and supporting pages.
New assessment confirm if dirty, call newAssessment, revoke preview, clear file input, selection, report and modal state, stage project, progress zero. Save genuine working assessment safely using core storage functions.
Catch UI event/render failures with recovery message (no reload loop). Local storage failure warning.
Dashboard metrics computed from state, no fabricated time saving; 90-day pilot measurable targets clearly marked targets.
Rule search, pack/source/status filters, metadata/versions/change history/tests visible. Unverified rules show disclaimer.
Minimal loading step with cancellable timer or generation token to block stale results after reset/exit demo. Disable duplicate analyze actions.
Professional navy/teal/white/gold Arabic engineering UI; preserve existing useful SLD/technical-grid identity but derive nodes/labels from model, not hardcoded values. Accessible form labels, dialogs, focus, responsive layouts, no emoji.