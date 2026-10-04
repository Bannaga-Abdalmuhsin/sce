import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';

test('browser assessment, interrupted-analysis reset, report invalidation, navigation and presentation isolation', {
  skip: !existsSync(executablePath) && 'Chromium binary is not installed in this environment'
}, async t => {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'ignore' });
  let browser;
  try {
    let response;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { response = await fetch('http://127.0.0.1:5000/'); if (response.ok) break; } catch {}
      await delay(100);
    }
    assert.ok(response?.ok, 'static app server starts on port 5000');
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('http://127.0.0.1:5000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /مراجعات أسرع/ }).waitFor();

    // Every navigation item responds; language swaps the actual document direction.
    await page.locator('[data-view="about"]').click();
    await page.locator('#aboutView').waitFor({ state: 'visible' });
    await page.locator('#languageToggle').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    await page.locator('[data-view="rules"]').click();
    await page.locator('#ruleSearch').fill('SBC401-OCP-07');
    await page.getByText('Protection coordination').first().waitFor();
    await page.locator('#languageToggle').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');

    await page.locator('[data-view="workspace"]').click();
    await page.getByRole('button', { name: 'بدء تقييم جديد' }).last().click();
    await page.locator('#projectName').fill('Browser test project');
    await page.locator('#projectCity').fill('Riyadh');
    await page.locator('#revision').fill('Rev.99');
    await page.locator('#reviewer').fill('Test engineer');
    await page.locator('#license').fill('TEST-NOT-VALID');
    await page.locator('#drawingFile').setInputFiles({
      name: 'sample.dwg', mimeType: 'application/acad', buffer: Buffer.from('illustrative browser test drawing')
    });
    await page.getByRole('button', { name: /إنشاء مساحة العمل/ }).click();
    await page.getByRole('button', { name: /تشغيل الاستخراج التوضيحي/ }).click();
    await page.getByText('DB-HVAC').first().waitFor({ timeout: 3000 });
    const assessmentBefore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'maeyar-workspace-v2');
    assert.equal(assessmentBefore.assessment.project.name, 'Browser test project');
    assert.ok(assessmentBefore.assessment.findings.some(f => f.ruleId === 'SBC401-OCP-07' && f.equipmentId === 'DB-HVAC'));

    await page.locator('[data-view="reports"]').click();
    await page.locator('#generateReportBtn').click();
    await page.waitForFunction(() => document.querySelector('#reportPreview')?.getAttribute('src')?.startsWith('blob:'));

    // Reset during a cancellable extraction invalidates the pending callback and every cached report.
    await page.locator('[data-view="workspace"]').click();
    await page.locator('#recalculateBtn').click();
    await page.locator('#newAssessmentBtn').click();
    await page.locator('#confirmProceed').click();
    await delay(550);
    const clean = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'maeyar-workspace-v2');
    assert.notEqual(clean.assessment.id, assessmentBefore.assessment.id);
    assert.equal(clean.assessment.stage, 'project');
    assert.equal(clean.assessment.progress, 0);
    assert.equal(clean.assessment.drawing, null);
    assert.deepEqual(clean.assessment.equipment, []);
    assert.deepEqual(clean.assessment.findings, []);
    assert.equal(clean.assessment.report, null);
    await page.locator('[data-view="reports"]').click();
    assert.equal(await page.locator('#reportPreview').count(), 0);
    assert.ok((await page.locator('#reportPanel').innerText()).includes('لا يوجد تقرير'));

    // The demo starts analyzed, highlights the sample mismatch, and leaves saved state untouched.
    const savedBeforeDemo = await page.evaluate(key => localStorage.getItem(key), 'maeyar-workspace-v2');
    await page.locator('#presentationBtn').click();
    await page.locator('#presentationNext').click();
    await page.locator('[data-open-finding*="SBC401-OCP-07-DB-HVAC"]').waitFor();
    await page.locator('#presentationNext').click();
    assert.equal(await page.locator('[data-view-panel="rules"]').evaluate(el => el.classList.contains('active')), true);
    await page.locator('#presentationRestart').click();
    await page.locator('#presentationExit').click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), 'maeyar-workspace-v2'), savedBeforeDemo);
    assert.equal(await page.locator('#presentationBanner').isVisible(), false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-view="about"]').click();
    assert.ok(await page.locator('#aboutView').evaluate(el => el.getBoundingClientRect().width <= window.innerWidth));
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
    await delay(80);
  }
});