import {
  createAssessment, setProject, attachDrawing, analyzeAssessment, updateEquipment,
  reviewFinding, addComment, signOff, newAssessment, demoAssessment, dashboardStats,
  persistWorkspace, restoreWorkspace, WORKSPACE_KEY
} from './src/core/assessment.js';
import { RULES, DEMO_DISCLAIMER } from './src/core/rules.js';
import { calculateEquipment } from './src/core/calculations.js';
import { generateReport, downloadReport } from './src/core/report.js';
import { tr, esc, bilingual } from './src/ui/i18n.js';

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const validExtensions = new Set(['pdf','dwg','dxf']);
let lang = localStorage.getItem('maeyar-language') === 'en' ? 'en' : 'ar';
let workspace, history = [], currentView = 'dashboard', selectedFile = null, pdfUrl = null, reportUrl = null;
let isPresentation = false, presentationStep = 0, presentationTimer = null, generation = 0, zoom = 1;
let lastErrorRetry = null, storageFailed = false;

function initWorkspace() {
  try {
    const restored = restoreWorkspace(localStorage);
    workspace = restored?.assessment ?? createAssessment();
    history = Array.isArray(restored?.history) ? restored.history : [];
  } catch (error) {
    workspace = createAssessment();
    history = [];
    showStorageWarning(error);
  }
}
function message(key) { return tr(key, lang); }
function time(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(d);
}
function sizeLabel(bytes=0) { return bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1024/1024).toFixed(2)} MB`; }
function statusLabel(stage) {
  return message(({project:'statusProject',upload:'statusUpload',ready:'statusReady',review:'statusReview',completed:'statusCompleted'})[stage] || 'statusWaiting');
}
function showToast(text) {
  const toast=$('#toast'); toast.textContent=text; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600);
}
function showError(error, retry=null) {
  const banner=$('#errorBanner');
  $('#errorMessage').textContent = error?.message || message('analysisError');
  banner.classList.add('show'); lastErrorRetry=retry;
}
function hideError(){ $('#errorBanner').classList.remove('show'); }
function showStorageWarning(error) {
  storageFailed=true;
  $('#saveState').textContent=message('saveWarning');
  $('#saveState').title=error?.message || '';
}
function guarded(fn) {
  return (...args) => {
    try { return fn(...args); }
    catch (error) { console.error('Maeyar UI action failed',error); showError(error); }
  };
}
function persist() {
  if (isPresentation || workspace?.demo) return;
  try {
    persistWorkspace(localStorage,workspace,history);
    storageFailed=false;
    $('#saveState').textContent=message('localWorkspace');
  } catch(error) { showStorageWarning(error); }
}
function revokePreview() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  pdfUrl=null; reportUrl=null; selectedFile=null;
  const input=$('#drawingFile'); if(input) input.value='';
  const name=$('#selectedFileName'); if(name) name.textContent='';
}
function openModal(id) {
  const modal=$(`#${id}`); if(!modal)return;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  const focusable=$('input:not([type=file]),button,select,textarea',modal); focusable?.focus();
  modal.dataset.returnFocus=document.activeElement?.id || '';
}
function closeModal(modal) {
  if(!modal)return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
  const previous=modal.dataset.returnFocus && $(`#${modal.dataset.returnFocus}`);
  previous?.focus();
}
function closeDrawer() {
  $('#findingDrawer').classList.remove('open'); $('#findingDrawer').setAttribute('aria-hidden','true');
  $('#drawerContent').replaceChildren();
}
function safePersistNew(previous) {
  const result = newAssessment(previous,history);
  workspace=result.assessment;
  history=result.history;
  persist();
}
function startFresh() {
  generation++;
  clearTimeout(presentationTimer);
  revokePreview();
  closeDrawer();
  ['assessmentModal','confirmModal','aboutModal'].forEach(id=>closeModal($(`#${id}`)));
  $('#analysisProgress').classList.add('hidden');
  $('#assessmentForm').reset();
  $('#revision').value='Rev.01';
  $('#projectTypeCommercial')?.removeAttribute('selected');
  $('#workspaceFindings,#sldSection,#equipmentSection,#drawingSection,#signoffSection').forEach?.(()=>{});
  safePersistNew(workspace);
  storageFailed=false;
  switchView('workspace');
  hideError();
  render();
}
function requestNewAssessment() {
  if (workspace?.dirty || (workspace?.stage && workspace.stage !== 'project' && workspace.stage !== 'completed')) {
    $('#confirmMessage').textContent=`${message('newAssessmentConfirm')} ${message('dirtyWarning')} ${message('resetSafe')}`;
    openModal('confirmModal');
    $('#confirmProceed').onclick=guarded(()=>{safePersistNew(workspace);closeModal($('#confirmModal'));revokePreview();startFreshAfterReset();});
    return;
  }
  startFresh();
}
function startFreshAfterReset() {
  generation++; revokePreview(); closeDrawer(); closeModal($('#assessmentModal'));
  $('#assessmentForm').reset(); $('#revision').value='Rev.01'; hideError();
  switchView('workspace'); render();
  showToast(message('newAssessmentStarted'));
}
function switchView(view, updateHash=true) {
  const allowed=['dashboard','workspace','findings','rules','reports','about'];
  if(!allowed.includes(view)) view='dashboard';
  currentView=view;
  $$('.view[data-view-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.viewPanel===view));
  $$('.nav-item').forEach(nav=>nav.classList.toggle('active',nav.dataset.view===view));
  $('#pageTitle').textContent=message(({dashboard:'dashboardTitle',workspace:'workspacePageTitle',findings:'findingsPageTitle',rules:'rulesPageTitle',reports:'reportsPageTitle',about:'aboutPageTitle'})[view]);
  $('#crumb').textContent=`مِعيار AI / ${message(({dashboard:'navDashboard',workspace:'navWorkspace',findings:'navFindings',rules:'navRules',reports:'navReports',about:'navAbout'})[view])}`;
  if(updateHash && location.hash !== `#${view}`) historyReplace(`#${view}`);
  renderView(view);
}
function historyReplace(hash) {
  try { window.history.replaceState(null,'',hash); }
  catch { location.hash=hash; }
}
function render() {
  try {
    applyLanguage();
    renderView(currentView);
    $('#presentationBanner').classList.toggle('show',isPresentation);
  } catch(error) {
    console.error('Maeyar render failed',error);
    showError(error,()=>render());
  }
}
function renderView(view) {
  hideError();
  if(view==='dashboard') renderDashboard();
  if(view==='workspace') renderWorkspace();
  if(view==='findings') renderAllFindings();
  if(view==='rules') renderRules();
  if(view==='reports') renderReports();
  if(view==='about') renderAbout();
}
function applyLanguage() {
  document.documentElement.lang=lang; document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.title=lang==='ar'?'مِعيار AI | منصة الامتثال الكهربائي':'Maeyar AI | Electrical Compliance Copilot';
  $('#languageToggle').textContent=lang==='ar'?'EN':'ع';
  $$('[data-i18n]').forEach(el=>{ const text=message(el.dataset.i18n); if(text)el.textContent=text; });
  $$('[data-i18n-placeholder]').forEach(el=>el.placeholder=message(el.dataset.i18nPlaceholder));
}
function pct(value) { return Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'; }
function findingsFor(source=workspace) { return source?.findings ?? []; }
function openFinding(findingId) {
  const finding=findingsFor().find(item=>item.id===findingId);
  if(!finding)return;
  const comments=(workspace.comments||[]).filter(comment=>comment.findingId===finding.id);
  const sev=String(finding.severity||'Information').toLowerCase();
  const title=bilingual(finding.title,lang);
  $('#drawerContent').innerHTML=`
    <span class="badge ${esc(sev)}">${esc(message(sev))}</span>
    <p class="detail-kicker">${esc(finding.id)} · ${esc(finding.ruleId)} · v${esc(finding.ruleVersion)}</p>
    <h2 id="drawerTitle">${esc(title)}</h2>
    <p>${esc(finding.location||'—')} · ${esc(message('confidence'))} ${esc(`${Math.round((finding.confidence||0)*100)}%`)}</p>
    <h3>${esc(message('evidenceChain'))}</h3>
    <div class="trace-chain">
      ${traceNode('drawingEvidence',finding.evidence?.drawing||workspace.drawing?.evidenceLabel||workspace.drawing?.name)}
      ${traceNode('extracted',finding.evidence?.extracted||finding.extractedValue)}
      ${traceNode('calculation',finding.evidence?.calculation||finding.calculation)}
      ${traceNode('ruleBasis',finding.evidence?.rule||`${finding.ruleId} · ${finding.expectedRequirement||''}`)}
      ${traceNode('finding',finding.evidence?.finding||title)}
      ${traceNode('correctiveAction',finding.evidence?.correctiveAction||bilingual(finding.recommendedAction,lang))}
    </div>
    <div class="drawer-section"><h3>${esc(message('decision'))}: <span class="badge ${esc(String(finding.decision||'pending'))}">${esc(message(finding.decision||'pending'))}</span></h3>
      ${finding.reviewer?`<p>${esc(message('reviewedBy'))}: ${esc(finding.reviewer)} · ${esc(time(finding.reviewedAt))}</p>`:''}
      <label class="form-field"><span>${esc(message('reviewerLabel'))}</span><input id="findingReviewer" value="${esc(finding.reviewer||workspace.project?.reviewer||'')}" maxlength="120"></label>
      <label class="form-field"><span>${esc(message('commentLabel'))}</span><textarea id="findingComment" rows="3" maxlength="1000" placeholder="${esc(message('commentLabel'))}">${esc(finding.comment||'')}</textarea></label>
      <div class="decision-actions">
        <button class="btn btn-primary" data-review-decision="accepted">${esc(message('accept'))}</button>
        <button class="btn" data-review-decision="rejected">${esc(message('reject'))}</button>
        <button class="btn" data-review-decision="resolved">${esc(message('resolve'))}</button>
        <button class="btn" id="addFindingComment">${esc(message('addComment'))}</button>
      </div>
    </div>
    <div class="drawer-section"><h3>${esc(message('noComments'))}</h3><div class="comment-list">${comments.length?comments.map(comment=>`<div class="comment-item"><small>${esc(comment.reviewer)} · ${esc(time(comment.timestamp))}</small>${esc(comment.comment)}</div>`).join(''):`<p>${esc(message('noComments'))}</p>`}</div></div>`;
  $('#findingDrawer').classList.add('open'); $('#findingDrawer').setAttribute('aria-hidden','false');
  $$('[data-review-decision]',$('#drawerContent')).forEach(button=>button.onclick=guarded(()=>{
    const reviewer=$('#findingReviewer').value.trim(),comment=$('#findingComment').value.trim();
    if(!reviewer||!comment){showToast(message('reviewRequired'));$('#findingComment').focus();return;}
    workspace=reviewFinding(workspace,finding.id,{decision:button.dataset.reviewDecision,comment,reviewer});
    persist(); closeDrawer(); render(); showToast(message('decisionSaved'));
  }));
  $('#addFindingComment').onclick=guarded(()=>{
    const reviewer=$('#findingReviewer').value.trim(),comment=$('#findingComment').value.trim();
    if(!reviewer||!comment){showToast(message('commentRequired'));return;}
    workspace=addComment(workspace,finding.id,{comment,reviewer});persist();openFinding(finding.id);renderWorkspace();showToast(message('commentSaved'));
  });
}
function traceNode(label,value) {
  return `<div class="trace-node"><small>${esc(message(label))}</small><b>${esc(String(value??message('notSpecified')))}</b><p>${esc(label==='ruleBasis'?message('ruleDisclaimer'):'')}</p></div>`;
}
function statusPill(stage) { return `<span class="badge ${stage==='completed'?'pass':'pending'}">${esc(statusLabel(stage))}</span>`; }
function renderDashboard() {
  const stats=dashboardStats(history);
  const open=history.reduce((sum,a)=>sum+(a.findings||[]).filter(f=>f.decision==='pending').length,0)+(workspace?.demo?0:(workspace?.findings||[]).filter(f=>f.decision==='pending').length);
  const metrics=[
    ['statTotal',stats.total,'assessmentsUnit',''],
    ['statProgress',stats.inProgress,'statusReview',''],
    ['statPassed',stats.passed,'statusCompleted',''],
    ['statFindings',open,'pending','critical'],
    ['statTime',stats.timeReduction==null?message('noTimeData'):pct(stats.timeReduction),stats.timeReduction==null?'noTimeData':'targetMark','gold']
  ];
  $('#dashboardMetrics').innerHTML=metrics.map(([label,value,sub,klass])=>`<article class="metric ${klass}"><span class="metric-label">${esc(message(label))}</span><strong>${esc(String(value??0))}</strong><small>${esc(message(sub))}</small></article>`).join('');
  const shown=workspace?.demo?null:workspace;
  $('#dashboardProjectMeta').textContent=shown?.project?.name?`${shown.project.name} · ${shown.project.city}`:message('noCurrent');
  $('#dashboardStatus').textContent=shown?statusLabel(shown.stage):message('statusWaiting');
  if(!shown || shown.stage==='project') {
    $('#dashboardCurrent').innerHTML=`<div class="empty-state"><div class="empty-symbol">01</div><h3>${esc(message('projectsNone'))}</h3><p>${esc(message('startFirst'))}</p><button class="btn btn-primary" data-action="start-assessment">${esc(message('createOne'))}</button></div>`;
  } else {
    const pending=shown.findings.filter(f=>f.decision==='pending').length;
    $('#dashboardCurrent').innerHTML=`<div style="padding:16px"><div class="toolbar-row" style="justify-content:space-between"><div><b>${esc(shown.project.name)}</b><div class="copyright-note">${esc(shown.project.buildingType)} · ${esc(shown.project.revision)} · ${esc(shown.drawing?.name||'')}</div></div>${statusPill(shown.stage)}</div><div class="target-row"><span>${esc(message('findingsTitle'))}</span><b>${shown.findings.length} · ${pending} ${esc(message('pending'))}</b></div><div class="form-actions"><button class="btn btn-primary btn-small" data-action="go-workspace">${esc(message('openWorkspace'))}</button></div></div>`;
  }
  const audit=[...(workspace?.demo?[]:(workspace?.audit||[])),...history.flatMap(a=>a.audit||[])].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,5);
  $('#dashboardAudit').innerHTML=audit.length?`<div class="audit-list">${audit.map(a=>`<div class="audit-item"><time>${esc(time(a.timestamp))}</time><code>${esc(a.action)}</code><span>${esc(a.detail||'')}</span></div>`).join('')}</div>`:`<div class="empty-state"><h3>${esc(message('noAudit'))}</h3><p>${esc(message('auditTrailSubtitle'))}</p></div>`;
}
function renderWorkspace() {
  const active=workspace && !workspace.demo && workspace.stage!=='project';
  $('#stageStrip').innerHTML=[['stageProject','project'],['stageUpload','upload'],['stageExtraction','review'],['stageReview','completed']].map(([key,stage],i)=>{
    const order={project:0,upload:1,ready:2,review:3,completed:4};
    const current=order[workspace?.stage]??0;
    return `<span class="stage-step ${current===i?'current':''} ${current>i?'done':''}"><i>${current>i?'✓':String(i+1).padStart(2,'0')}</i>${esc(message(key))}</span>`;
  }).join('');
  if(!active || workspace.stage==='project') {
    $('#projectSetup').innerHTML=`<section class="surface project-form"><div class="section-heading"><div><h2>${esc(message('projectFormTitle'))}</h2><p>${esc(message('projectFormIntro'))}</p></div></div><div class="form-actions"><button class="btn btn-primary" data-action="start-assessment">${esc(message('startAssessment'))}</button></div><div class="empty-state"><div class="empty-symbol">01</div><h3>${esc(message('emptyStage'))}</h3><p>${esc(message('sampleExtractionNotice'))}</p></div></section>`;
    $('#drawingSection,#sldSection,#equipmentSection,#workspaceFindings,#signoffSection').forEach?.(()=>{});
    ['drawingSection','sldSection','equipmentSection','workspaceFindings','signoffSection'].forEach(id=>$(`#${id}`).classList.add('hidden'));
    return;
  }
  $('#projectSetup').innerHTML=`<div class="surface project-form"><div class="toolbar-row" style="justify-content:space-between"><div><b>${esc(workspace.project.name)}</b><div class="copyright-note">${esc(workspace.project.city)} · ${esc(workspace.project.buildingType)} · ${esc(workspace.project.revision)}</div></div>${statusPill(workspace.stage)}</div></div>`;
  $('#drawingSection').classList.remove('hidden');
  $('#drawingStatus').textContent=statusLabel(workspace.stage);
  renderDrawing();
  const analyzed=['review','completed'].includes(workspace.stage);
  $('#sldSection').classList.toggle('hidden',!analyzed);
  $('#equipmentSection').classList.toggle('hidden',!analyzed);
  $('#workspaceFindings').classList.toggle('hidden',!analyzed);
  $('#signoffSection').classList.toggle('hidden',!analyzed);
  $('#analyzeBtn').disabled=workspace.stage==='review'||workspace.stage==='completed';
  if(analyzed) {
    renderSld(); renderEquipment(); renderFindingList($('#workspaceFindingList'),workspace.findings.slice(0,4));
    renderSignoff();
  } else {
    $('#sldCanvas').replaceChildren(); $('#equipmentRows').replaceChildren(); $('#workspaceFindingList').replaceChildren();
  }
}
function renderDrawing() {
  const drawing=workspace.drawing;
  if(!drawing){$('#drawingPreview').innerHTML=`<div class="empty-state"><h3>${esc(message('fileRequired'))}</h3></div>`;return;}
  const ext=drawing.name.split('.').pop().toLowerCase();
  let preview='';
  if(ext==='pdf'&&pdfUrl) preview=`<iframe title="${esc(message('pdfPreviewAlt'))}" src="${pdfUrl}#toolbar=1&navpanes=0"></iframe>`;
  else preview=`<div class="empty-state"><div class="empty-symbol">${ext.toUpperCase()}</div><h3>${esc(message('pdfUnsupported'))}</h3><p>${esc(message('demoDrawing'))}</p></div>`;
  $('#drawingPreview').innerHTML=`<div class="file-preview">${preview}</div><div class="file-meta"><b>${esc(message('fileMetadata'))}</b><div>${esc(message('fileName'))}: ${esc(drawing.name)} · ${esc(message('fileSize'))}: ${esc(sizeLabel(drawing.size))} · ${esc(message('fileType'))}: ${esc(drawing.type||ext.toUpperCase())}</div></div>`;
}
function renderSld() {
  const equipment=workspace.equipment||[];
  if(!equipment.length){$('#sldCanvas').innerHTML=`<div class="empty-state">${esc(message('noFindingsText'))}</div>`;return;}
  const w=900,h=Math.max(360,90+equipment.length*78),lineX=320,boxX=385,boxW=190,loadX=760;
  const rows=equipment.map((e,i)=>{
    const y=52+i*78+38, calculation=workspace.calculations.find(c=>c.equipmentId===e.id);
    const f=workspace.findings.find(item=>item.equipmentId===e.id&&item.severity==='Critical');
    const color=f?'#bd4b4b':'#087f79';
    return `<g data-equipment="${esc(e.id)}"><path d="M${lineX} ${y}H${boxX}" stroke="#3b6572" stroke-width="3"/><rect x="${boxX}" y="${y-25}" width="${boxW}" height="50" rx="4" fill="#fff" stroke="#285467" stroke-width="2"/><text x="${boxX+boxW/2}" y="${y-3}" text-anchor="middle" fill="#173847" font-family="IBM Plex Mono" font-size="15">${esc(e.label||e.id)}</text><text x="${boxX+boxW/2}" y="${y+15}" text-anchor="middle" fill="#687f88" font-size="11">${Number(e.breakerA).toFixed(0)} A · ${Number(e.cableMM2).toFixed(0)} mm²</text><path d="M${boxX+boxW} ${y}H${loadX-32}" stroke="#3b6572" stroke-width="3"/><circle cx="${loadX}" cy="${y}" r="29" fill="#fff" stroke="${color}" stroke-width="3"/><text x="${loadX}" y="${y-3}" text-anchor="middle" fill="#173847" font-family="IBM Plex Mono" font-size="13">${Number(e.loadKW).toFixed(0)}kW</text><text x="${loadX}" y="${y+12}" text-anchor="middle" fill="${color}" font-size="9">${calculation?calculation.currentA.toFixed(1):'—'} A</text>${f?`<circle cx="${boxX+boxW+18}" cy="${y-22}" r="12" fill="#bd4b4b"/><text x="${boxX+boxW+18}" y="${y-18}" text-anchor="middle" fill="white" font-size="10">!</text>`:''}</g>`;
  }).join('');
  const firstY=90+38, lastY=52+(equipment.length-1)*78+38;
  $('#sldCanvas').innerHTML=`<div class="blueprint" id="blueprint" style="width:min(100%,${w}px)"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(message('sldTitle'))}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="techGrid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#d5e2de" stroke-width=".6"/></pattern></defs><rect width="${w}" height="${h}" fill="#f6faf8"/><rect width="${w}" height="${h}" fill="url(#techGrid)"/><rect x="35" y="${Math.max(20,(firstY+lastY)/2-35)}" width="145" height="70" rx="4" fill="#17394b"/><text x="107" y="${(firstY+lastY)/2-4}" text-anchor="middle" fill="#fff" font-size="14">MAIN SUPPLY</text><text x="107" y="${(firstY+lastY)/2+16}" text-anchor="middle" fill="#b9d1d4" font-size="10">400 V · 3Φ</text><path d="M180 ${(firstY+lastY)/2}H${lineX}V${firstY}${equipment.length>1?` M${lineX} ${lastY}V${firstY}`:''}" fill="none" stroke="#3b6572" stroke-width="3"/>${rows}<text x="28" y="${h-12}" fill="#71858c" font-family="IBM Plex Mono" font-size="10">MAEYAR · ILLUSTRATIVE MODEL · NOT EXTRACTED GEOMETRY</text></svg></div><span class="canvas-badge">${equipment.length} · ${esc(message('demoDrawing'))}</span>`;
  $('#blueprint').style.transform=`scale(${zoom})`; $('#zoomValue').textContent=`${Math.round(zoom*100)}%`;
}
const fields=[['loadKW','connectedLoad'],['voltage','voltage'],['lengthM','length'],['cableMM2','cable'],['breakerA','breaker']];
function renderEquipment() {
  const data=workspace.equipment||[];
  $('#equipmentHead').innerHTML=`<tr><th>${esc(message('location'))}</th>${fields.map(([,key])=>`<th>${esc(message(key))}</th>`).join('')}<th>${esc(message('designCurrent'))}</th><th>${esc(message('voltageDrop'))}</th><th>${esc(message('result'))}</th></tr>`;
  $('#equipmentRows').innerHTML=data.map(e=>{
    const calc=workspace.calculations.find(c=>c.equipmentId===e.id)||calculateEquipment(e);
    const checks=workspace.checks.filter(c=>c.equipmentId===e.id);
    const result=checks.some(c=>c.result==='fail')?'failed':checks.some(c=>c.result==='review')?'needsReview':'passed';
    return `<tr data-equipment-id="${esc(e.id)}"><td><b>${esc(e.label||e.id)}</b><br><small>${esc(e.location||'')}</small></td>${fields.map(([field])=>`<td><input class="cell-input" type="number" min="0" step="any" aria-label="${esc(message(field))} ${esc(e.label||e.id)}" data-equip-field="${field}" value="${esc(e[field])}"></td>`).join('')}<td class="mono">${calc.currentA.toFixed(1)}</td><td class="mono">${calc.voltageDropPct.toFixed(2)}</td><td><span class="badge ${result==='passed'?'pass':result==='failed'?'critical':'pending'}">${esc(message(result))}</span></td></tr>`;
  }).join('');
  $$('.cell-input',$('#equipmentRows')).forEach(input=>input.onchange=guarded(()=>{
    const row=input.closest('[data-equipment-id]'),val=Number(input.value);
    if(!Number.isFinite(val)||val<0){renderEquipment();return;}
    const equipment=workspace.equipment.find(item=>item.id===row.dataset.equipmentId);
    const changes={[input.dataset.equipField]:val};
    if(input.dataset.equipField==='loadKW') {
      const total=(equipment.phaseLoadsKW||[1,1,1]).reduce((a,b)=>a+b,0)||3;
      changes.phaseLoadsKW=equipment.phaseLoadsKW.map(v=>val*v/total);
    }
    workspace=updateEquipment(workspace,equipment.id,changes); persist(); render(); showToast(message('updated'));
  }));
}
function renderFindingList(container,findings) {
  if(!findings?.length){container.innerHTML=`<div class="empty-state"><div class="empty-symbol">—</div><h3>${esc(message('noFindings'))}</h3><p>${esc(message('noFindingsText'))}</p></div>`;return;}
  container.innerHTML=findings.map(f=>{
    const sev=String(f.severity||'Information').toLowerCase();
    return `<article class="finding-card" tabindex="0" role="button" data-open-finding="${esc(f.id)}"><div class="finding-top"><span class="badge ${esc(sev)}">${esc(message(sev))}</span><span class="badge ${esc(f.decision||'pending')}">${esc(message(f.decision||'pending'))}</span></div><h3 class="finding-title">${esc(bilingual(f.title,lang))}</h3><p class="finding-summary">${esc(f.expectedRequirement||f.evidence?.finding||'')}</p><div class="finding-meta"><span>${esc(f.ruleId)} · ${esc(f.location||'')}</span><button tabindex="-1">${esc(message('viewDetails'))} →</button></div></article>`;
  }).join('');
  $$('[data-open-finding]',container).forEach(card=>{
    card.onclick=()=>openFinding(card.dataset.openFinding);
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFinding(card.dataset.openFinding);}};
  });
}
function renderAllFindings() {
  const severity=$('#findingSeverityFilter'), decision=$('#findingDecisionFilter');
  if(!severity.options.length) severity.innerHTML=`<option value="">${esc(message('selectSeverity'))}</option>${['Critical','Major','Minor','Information'].map(v=>`<option value="${v}">${esc(message(v.toLowerCase()))}</option>`).join('')}`;
  if(!decision.options.length) decision.innerHTML=`<option value="">${esc(message('selectDecision'))}</option>${['pending','accepted','rejected','resolved'].map(v=>`<option value="${v}">${esc(message(v))}</option>`).join('')}`;
  let items=findingsFor();
  if(severity.value)items=items.filter(f=>f.severity===severity.value);
  if(decision.value)items=items.filter(f=>f.decision===decision.value);
  renderFindingList($('#allFindingsList'),items);
}
function renderSignoff() {
  const decided=workspace.findings.every(f=>f.decision!=='pending');
  if(workspace.stage==='completed'&&workspace.signoff) {
    $('#signoffSection').innerHTML=`<div class="surface-head"><div><h3>${esc(message('reviewerSignoff'))}</h3><p>${esc(message('completedStatement'))}</p></div>${statusPill('completed')}</div><div class="table-note">${esc(workspace.signoff.reviewer)} · ${esc(workspace.signoff.license)} · ${esc(time(workspace.signoff.timestamp))}<br>${esc(workspace.signoff.comment)}<br><b>${esc(workspace.signoff.statement)}</b></div>`;
    return;
  }
  $('#signoffSection').innerHTML=`<div class="surface-head"><div><h3>${esc(message('reviewerSignoff'))}</h3><p>${esc(message('signoffIntro'))}</p></div><span class="badge ${decided?'pass':'pending'}">${decided?esc(message('accepted')):esc(message('pending'))}</span></div><div style="padding:14px"><div class="form-grid"><label class="form-field">${esc(message('reviewerLabel'))}<input id="signoffReviewer" value="${esc(workspace.project.reviewer||'')}" required></label><label class="form-field">${esc(message('license'))}<input id="signoffLicense" value="${esc(workspace.project.license||'')}" required></label><label class="form-field" style="grid-column:1/-1">${esc(message('signoffComment'))}<textarea id="signoffComment" rows="2" required></textarea></label></div><div class="form-actions"><button class="btn btn-primary" id="signoffBtn" ${decided?'':'disabled'}>${esc(message('signoffButton'))}</button></div></div>`;
  $('#signoffBtn').onclick=guarded(()=>{
    const reviewer=$('#signoffReviewer').value.trim(),license=$('#signoffLicense').value.trim(),comment=$('#signoffComment').value.trim();
    if(!decided||!reviewer||!license||!comment){showToast(message('signoffMissing'));return;}
    workspace=signOff(workspace,{reviewer,license,comment});persist();render();showToast(message('completedStatement'));
  });
}
function renderRules() {
  const packs=[...new Set(RULES.map(r=>r.pack))],sources=[...new Set(RULES.map(r=>r.source))];
  fillFilter($('#rulePackFilter'),message('allPacks'),packs);
  fillFilter($('#ruleSourceFilter'),message('allSources'),sources);
  const status=$('#ruleStatusFilter');
  if(!status.options.length)status.innerHTML=`<option value="">${esc(message('allStatuses'))}</option><option value="true">${esc(message('active'))}</option><option value="false">${esc(message('inactive'))}</option>`;
  const query=$('#ruleSearch').value.trim().toLowerCase(),pack=$('#rulePackFilter').value,source=$('#ruleSourceFilter').value,active=status.value;
  const filtered=RULES.filter(rule=>{
    const title=bilingual(rule.title,lang);
    const search=[rule.id,title,rule.title.en,rule.title.ar,rule.pack,rule.source,rule.clause].join(' ').toLowerCase();
    return (!query||search.includes(query))&&(!pack||pack===rule.pack)&&(!source||source===rule.source)&&(active===''||String(rule.active)===active);
  });
  $('#rulesGrid').innerHTML=filtered.length?filtered.map(rule=>{
    const historyHtml=(rule.history||[]).map(item=>`<li>${esc(item.date)} · ${esc(item.change)}</li>`).join('');
    return `<article class="rule-card"><div class="rule-card-head"><code>${esc(rule.id)}</code><span class="badge ${rule.active?'pass':'minor'}">${esc(message(rule.active?'active':'inactive'))}</span></div><h3>${esc(bilingual(rule.title,lang))}</h3><div class="rule-meta"><span>${esc(rule.pack)}</span><span>${esc(rule.version)}</span><span>${esc(rule.discipline)}</span></div><div class="rule-detail"><b>${esc(message('source'))}:</b> ${esc(rule.source)}<br><b>${esc(message('edition'))}:</b> ${esc(rule.edition)}<br><b>${esc(message('clause'))}:</b> ${esc(rule.clause)}<br><b>${esc(message('inputs'))}:</b> ${esc((rule.inputs||[]).join(', '))}<br><b>${esc(message('method'))}:</b> ${esc(rule.method)}<br><b>${esc(message('logic'))}:</b> ${esc(rule.logic)}<br><b>${esc(message('verification'))}:</b> ${esc(rule.verificationStatus)}<br><b>${esc(message('effectiveDate'))}:</b> ${esc(rule.effectiveDate)}<br><b>${esc(message('testResult'))}:</b> ${esc(rule.testResult)}<br><b>${esc(message('correctiveAction'))}:</b> ${esc(bilingual(rule.action,lang))}</div><details><summary>${esc(message('ruleHistory'))}</summary><ul class="rule-history">${historyHtml}</ul></details></article>`;
  }).join(''):`<div class="empty-state">${esc(message('noRules'))}</div>`;
}
function fillFilter(select,placeholder,values) {
  const selected=select.value;
  const next=`<option value="">${esc(placeholder)}</option>${values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
  if(select.dataset.options!==next){select.innerHTML=next;select.dataset.options=next;}
  if(values.includes(selected))select.value=selected;
}
function renderReports() {
  const ready=workspace && !workspace.demo && ['review','completed'].includes(workspace.stage);
  if(!ready) {
    $('#reportPanel').innerHTML=`<div class="empty-state"><div class="empty-symbol">PDF</div><h3>${esc(message('noReport'))}</h3><p>${esc(message('noReportText'))}</p><button class="btn btn-primary" data-action="go-workspace">${esc(message('openWorkspace'))}</button></div>`;
  } else {
    $('#reportPanel').innerHTML=`<div class="toolbar-row" style="justify-content:space-between"><div><h3>${esc(message('reportReady'))}</h3><p>${esc(workspace.project.name)} · ${esc(workspace.project.revision)} · ${workspace.findings.length} ${esc(message('findingsTitle'))}</p></div><div class="toolbar-row"><button class="btn btn-small" id="generateReportBtn">${esc(message('generateReport'))}</button><button class="btn btn-primary btn-small" id="downloadReportBtn">${esc(message('downloadReport'))}</button></div></div><div class="banner-note">${esc(message('ruleDisclaimer'))}</div><iframe class="report-preview" id="reportPreview" title="${esc(message('reportReady'))}"></iframe>`;
    if(reportUrl)$('#reportPreview').src=reportUrl;
    $('#generateReportBtn').onclick=guarded(()=>createReportPreview());
    $('#downloadReportBtn').onclick=guarded(async()=>{await downloadReport(workspace);});
    $('#reportPreview').onload=()=>{};
  }
  const audits=workspace?.demo?[]:[...(workspace?.audit||[])].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  $('#auditList').innerHTML=audits.length?`<div class="audit-list">${audits.map(a=>`<div class="audit-item"><time>${esc(time(a.timestamp))}</time><code>${esc(a.action)}</code><span><b>${esc(a.actor||'')}</b> — ${esc(a.detail||'')}</span></div>`).join('')}</div>`:`<div class="empty-state"><h3>${esc(message('noAudit'))}</h3></div>`;
  $('#historyList').innerHTML=history.length?`<div class="audit-list">${history.map((a,i)=>`<div class="audit-item"><time>${esc(time(a.updatedAt||a.createdAt))}</time><code>${esc(a.stage)}</code><span><b>${esc(a.project?.name||'')}</b> · ${esc(a.project?.city||'')} <button class="btn btn-small" data-history-index="${i}">${esc(message('historyOpen'))}</button></span></div>`).join('')}</div>`:`<div class="empty-state"><h3>${esc(message('noHistory'))}</h3></div>`;
  $$('[data-history-index]').forEach(button=>button.onclick=guarded(()=>{
    const saved=history[Number(button.dataset.historyIndex)];
    if(!saved)return;
    if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=null;selectedFile=null;
    workspace={...saved}; switchView('workspace');
  }));
}
function createReportPreview() {
  const html=generateReport(workspace);
  if(reportUrl)URL.revokeObjectURL(reportUrl);
  reportUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  $('#reportPreview').src=reportUrl;
}
function renderAbout() {
  const how=lang==='ar'
    ?['رفع الرسم مع حفظه محليًا فقط.','استخراج عينة بيانات هندسية معلنة بوضوح.','حسابات وفحوصات حتمية بقواعد ذات معرف وإصدار.','مراجعة كل دليل وقرار بواسطة المهندس المرخص.','تقرير ثنائي اللغة وسجل أحداث ونتيجة مراجعة.']
    :['Upload a drawing, keeping it browser-local.','Run a clearly disclosed sample extraction.','Calculate and check using deterministic, versioned rules.','Have the licensed engineer inspect evidence and decide.','Produce a bilingual report, audit trail, and review record.'];
  const targets=lang==='ar'
    ?[['metricReviewTime','25%'],['metricTraceability','100%'],['metricDecisionCoverage','100%'],['metricFalsePositive','< 5%']]
    :[['metricReviewTime','25%'],['metricTraceability','100%'],['metricDecisionCoverage','100%'],['metricFalsePositive','< 5%']];
  $('#architectureList').innerHTML=how.map(item=>`<li>${esc(item)}</li>`).join('');
  $('#pilotTargets').innerHTML=targets.map(([key,value])=>`<div class="target-row"><span>${esc(message(key))} <small>${esc(message('targetMark'))}</small></span><b>${esc(value)}</b></div>`).join('');
  $('#pilotPhases').innerHTML=['phase1','phase2','phase3'].map(key=>`<div class="target-row"><span>${esc(message(key))}</span><b>●</b></div>`).join('');
  $('#pilotGuardrails').innerHTML=['guard1','guard2','guard3','guard4'].map(key=>`<li>${esc(message(key))}</li>`).join('');
}
function beginAnalysis() {
  if(!workspace?.drawing||workspace.demo)return;
  const token=++generation;
  $('#analyzeBtn').disabled=true;
  $('#analysisProgress').classList.remove('hidden');
  $('#analysisProgress').innerHTML=`<div class="loading-line"></div><p>${esc(message('analyzing'))}</p>`;
  const timer=setTimeout(guarded(()=>{
    if(token!==generation||workspace.demo)return;
    try {
      workspace=analyzeAssessment(workspace);
      $('#analysisProgress').classList.add('hidden');
      persist(); render(); showToast(message('analysisDone'));
    } catch(error) {
      $('#analyzeBtn').disabled=false; $('#analysisProgress').classList.add('hidden');
      showError(error,beginAnalysis);
    }
  }),450);
  $('#analyzeBtn').dataset.timer=String(timer);
}
function validateFile(file) {
  if(!file)throw new Error(message('fileRequired'));
  const ext=file.name.split('.').pop().toLowerCase();
  if(!validExtensions.has(ext))throw new Error(message('unsupportedFile'));
  if(file.size>MAX_FILE_BYTES)throw new Error(message('fileTooLarge'));
  return ext;
}
function acceptFile(file) {
  const ext=validateFile(file);
  if(pdfUrl){URL.revokeObjectURL(pdfUrl);pdfUrl=null;}
  selectedFile=file;
  if(ext==='pdf')pdfUrl=URL.createObjectURL(file);
  $('#selectedFileName').textContent=`${file.name} · ${sizeLabel(file.size)}`;
  return ext;
}
function submitAssessment(event) {
  event.preventDefault();
  try {
    if(!selectedFile)throw new Error(message('fileRequired'));
    const form=new FormData(event.currentTarget);
    const project={
      name:String(form.get('name')||'').trim(),city:String(form.get('city')||'').trim(),
      buildingType:String(form.get('buildingType')||''),revision:String(form.get('revision')||'').trim(),
      client:String(form.get('client')||'').trim(),reviewer:String(form.get('reviewer')||'').trim(),
      license:String(form.get('license')||'').trim(),
      ...(form.get('baselineMinutes')!==''?{baselineMinutes:Number(form.get('baselineMinutes'))}:{}),
      ...(form.get('reviewMinutes')!==''?{reviewMinutes:Number(form.get('reviewMinutes'))}:{})
    };
    if(!project.name||!project.city||!project.reviewer||!project.license)throw new Error(message('projectRequired'));
    const file=selectedFile;
    let next=setProject(createAssessment(),project);
    next=attachDrawing(next,{name:file.name,size:file.size,type:file.type});
    workspace=next;
    closeModal($('#assessmentModal'));
    switchView('workspace');persist();render();showToast(message('newAssessmentStarted'));
  } catch(error) {
    showError(error);
  }
}
function startPresentation() {
  clearTimeout(presentationTimer);
  const isolated=demoAssessment();
  if(!isolated?.demo)throw new Error('Demo assessment must be isolated');
  isPresentation=true;presentationStep=0;workspace=isolated;
  presentationTimer=setTimeout(()=>endPresentation(),180000);
  switchView('workspace');render();showToast(message('presentationStarted'));updatePresentation();
}
function updatePresentation() {
  $('#presentationBanner').classList.toggle('show',isPresentation);
  if(!isPresentation)return;
  const steps=message('presentationSteps');
  $('#presentationStepText').textContent=steps[presentationStep]||steps.at(-1);
  $('#presentationNext').textContent=presentationStep>=2?message('restart'):message('next');
  document.querySelectorAll('.spotlight').forEach(node=>node.classList.remove('spotlight'));
  if(presentationStep===0)$('#dashboardView .welcome-band')?.classList.add('spotlight');
  if(presentationStep===1) {
    const equipment=workspace.equipment.find(e=>e.label==='DB-HVAC'||e.drawingLabel==='DB-HVAC');
    const finding=workspace.findings.find(f=>f.equipmentId===equipment?.id);
    if(finding) {
      const card=$(`[data-open-finding="${CSS.escape(finding.id)}"]`);
      card?.classList.add('spotlight');
      if(currentView!=='workspace')switchView('workspace');
    }
    $('#blueprint')?.classList.add('spotlight');
  }
  if(presentationStep===2)$('#rulesView .banner-note')?.classList.add('spotlight');
}
function endPresentation() {
  if(!isPresentation)return;
  generation++;clearTimeout(presentationTimer);isPresentation=false;presentationStep=0;
  workspace=workspaceBeforeDemo||genuineWorkspace;
  if(workspaceBeforeDemo===undefined)workspace=genuineWorkspace||createAssessment();
  workspaceBeforeDemo=undefined;genuineWorkspace=undefined;
  $$('.spotlight').forEach(node=>node.classList.remove('spotlight'));
  $('#presentationBanner').classList.remove('show');
  switchView('dashboard');render();showToast(message('presentationEnded'));
}
let genuineWorkspace,workspaceBeforeDemo;
function enterPresentation() {
  genuineWorkspace=workspace;
  workspaceBeforeDemo=workspace;
  startPresentation();
}
function restartPresentation() {
  workspace=demoAssessment();presentationStep=0;
  switchView('workspace');render();updatePresentation();
}
function nextPresentation() {
  if(presentationStep>=2){restartPresentation();return;}
  presentationStep++;switchView(presentationStep===0?'dashboard':'workspace');render();updatePresentation();
}
function bindActions() {
  $$('.nav-item').forEach(button=>button.onclick=()=>switchView(button.dataset.view));
  $$('[data-action]').forEach(button=>button.onclick=guarded(()=>{
    const action=button.dataset.action;
    if(action==='start-assessment')openModal('assessmentModal');
    if(action==='open-presentation')enterPresentation();
    if(action==='go-workspace')switchView('workspace');
    if(action==='go-findings')switchView('findings');
    if(action==='go-reports')switchView('reports');
  }));
  $('#languageToggle').onclick=()=>{lang=lang==='ar'?'en':'ar';localStorage.setItem('maeyar-language',lang);render();};
  $('#newAssessmentBtn').onclick=guarded(requestNewAssessment);
  $('#newAssessmentInline').onclick=guarded(requestNewAssessment);
  $('#presentationBtn').onclick=guarded(enterPresentation);
  $('#presentationRestart').onclick=guarded(restartPresentation);
  $('#presentationNext').onclick=guarded(nextPresentation);
  $('#presentationExit').onclick=guarded(endPresentation);
  $('#assessmentForm').onsubmit=submitAssessment;
  $('#drawingFile').onchange=guarded(event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{acceptFile(file);}catch(error){event.target.value='';selectedFile=null;showError(error);}
  });
  $('#analyzeBtn').onclick=guarded(beginAnalysis);
  $('#recalculateBtn').onclick=guarded(()=>{
    if(!workspace?.equipment?.length)return;
    workspace.equipment.forEach(e=>calculateEquipment(e));
    workspace=analyzeAssessment({...workspace,stage:'ready'});
    persist();render();showToast(message('updated'));
  });
  $('#zoomIn').onclick=()=>{zoom=Math.min(1.5,zoom+.1);renderSld();};
  $('#zoomOut').onclick=()=>{zoom=Math.max(.65,zoom-.1);renderSld();};
  $('#fitBtn').onclick=()=>{zoom=1;renderSld();};
  $('#findingSeverityFilter').onchange=renderAllFindings;
  $('#findingDecisionFilter').onchange=renderAllFindings;
  ['ruleSearch','rulePackFilter','ruleSourceFilter','ruleStatusFilter'].forEach(id=>{
    const el=$(`#${id}`);el.addEventListener(id==='ruleSearch'?'input':'change',renderRules);
  });
  $('#drawerClose').onclick=closeDrawer;
  $('#findingDrawer').onclick=e=>{if(e.target.id==='findingDrawer')closeDrawer();};
  $$('.modal').forEach(modal=>{
    modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal);});
    $$('[data-close-modal]',modal).forEach(button=>button.onclick=()=>closeModal(modal));
  });
  $('#confirmProceed').onclick=guarded(()=>{safePersistNew(workspace);closeModal($('#confirmModal'));revokePreview();startFreshAfterReset();});
  $('#errorRetry').onclick=guarded(()=>{hideError();lastErrorRetry?lastErrorRetry():render();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeDrawer();$$('.modal.open').forEach(closeModal);}
  });
  window.addEventListener('hashchange',()=>switchView(location.hash.slice(1)||'dashboard',false));
  window.addEventListener('beforeunload',()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);if(reportUrl)URL.revokeObjectURL(reportUrl);});
}
function configureProjectForm() {
  const types=[
    ['projectTypeCommercial','commercial building'],['projectTypeResidential','residential building'],
    ['projectTypeIndustrial','industrial facility'],['projectTypeHealthcare','healthcare facility'],['projectTypeOther','other']
  ];
  $('#buildingType').innerHTML=types.map(([key,value])=>`<option value="${esc(value)}">${esc(message(key))}</option>`).join('');
}
initWorkspace();
configureProjectForm();
bindActions();
const requestedView=location.hash.slice(1);
switchView(['dashboard','workspace','findings','rules','reports','about'].includes(requestedView)?requestedView:'dashboard',false);
render();