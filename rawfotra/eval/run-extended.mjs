/* RAWFOTRA extended adversarial evaluation runner (audit Stage 10).
   Usage: node eval/run-extended.mjs [baseUrl]
   Fixtures and expected behaviors live in fixtures.json, apart from the app. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// playwright-core may live outside this repo (it is a test-time dependency
// only); point EVAL_NODE_MODULES at a directory that contains node_modules.
const req = createRequire(process.env.EVAL_NODE_MODULES ? join(process.env.EVAL_NODE_MODULES, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');

const BASE = process.argv[2] || 'http://localhost:8618/';
const FIX = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures.json'), 'utf8'));
const exePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({ executablePath: exePath });
const ctx = await browser.newContext({ reducedMotion: 'reduce' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.accept());

let pass = 0, fail = 0;
const failures = [];
const record = (id, ok, why) => {
  if (ok) pass++; else { fail++; failures.push(id + ': ' + why); }
  console.log((ok ? ' ✓ ' : ' ✗ ') + id + ' — ' + why);
};

async function freshCouncil(q, bench = ['Buffett', 'Feynman', 'Munger']) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.click('#councilBtn');
  for (const name of bench) { await page.fill('#councilFilter', name); await page.click('.pick').catch(() => {}); }
  await page.fill('#councilQuestion', q);
  await page.click('#councilConvene');
  await page.waitForSelector('#councilConsolidated:not([hidden])', { timeout: 25000 });
  await page.waitForTimeout(250);
  return page.evaluate(() => ({
    doc: document.getElementById('consensusDoc').textContent,
    ui: document.getElementById('councilConsolidated').textContent,
    verdict: (document.querySelector('.cons-verdict') || {}).textContent || '',
    hasSensitivity: !!document.querySelector('.cons-mc'),
  }));
}
async function freshChat(mind, msg) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#searchInput', mind);
  await page.click('#mindGrid .mind-card');
  await page.click('#profileChatBtn');
  await page.fill('#chatInput', msg);
  await page.press('#chatInput', 'Enter');
  await page.waitForFunction(() => {
    const m = document.querySelectorAll('#chatLog .msg.mentor');
    return m.length >= 2 && !m[m.length - 1].classList.contains('thinking');
  }, null, { timeout: 12000 });
  return page.$$eval('#chatLog .msg.mentor', m => m[m.length - 1].textContent);
}

for (const c of FIX.cases) {
  try {
    if (c.kind === 'council' || c.kind === 'council2') {
      const r1 = await freshCouncil(c.q || c.q1);
      let ok = true, why = c.why;
      for (const s of c.mustContain || []) if (!r1.doc.includes(s)) { ok = false; why = `missing "${s}" — ` + c.why; }
      for (const s of c.mustNotContain || []) if (r1.doc.includes(s)) { ok = false; why = `must not contain "${s}" — ` + c.why; }
      for (const s of c.mustContainUI || []) if (!r1.ui.includes(s)) { ok = false; why = `UI missing "${s}" — ` + c.why; }
      for (const s of c.mustNotContainUI || []) if (r1.ui.includes(s)) { ok = false; why = `UI must not contain "${s}" — ` + c.why; }
      for (const s of c.mustNotContainVerdict || []) if (r1.verdict.includes(s)) { ok = false; why = `verdict must not contain "${s}" — ` + c.why; }
      if (c.flags && c.flags.noSensitivity && r1.hasSensitivity) { ok = false; why = 'sensitivity shown on declined task — ' + c.why; }
      if (c.kind === 'council2') {
        const r2 = await freshCouncil(c.q2);
        if (c.mustDiffer && r1.doc.replace(/\s+/g, '') === r2.doc.replace(/\s+/g, '')) { ok = false; why = 'revised input produced identical document — ' + c.why; }
      }
      record(c.id, ok, why);
    } else if (c.kind === 'chat') {
      const reply = await freshChat(c.mind, c.q);
      let ok = true, why = c.why;
      for (const s of c.mustContain || []) if (!reply.includes(s)) { ok = false; why = `missing "${s}" — ` + c.why; }
      record(c.id, ok, why);
    }
  } catch (e) {
    record(c.id, false, 'threw: ' + e.message.slice(0, 100));
  }
}

/* ── Product resilience ── */
try { // PR-01 double submit
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.click('#councilBtn');
  await page.fill('#councilFilter', 'Buffett'); await page.click('.pick');
  await page.fill('#councilQuestion', 'Double-submit resilience check?');
  await page.click('#councilConvene'); await page.click('#councilConvene').catch(() => {});
  await page.waitForSelector('#councilConsolidated:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(400);
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('freemasonry-circle.council.history') || '[]'));
  record('PR-01', hist.length === 1, 'double-clicking Convene produced exactly one run (' + hist.length + ')');
} catch (e) { record('PR-01', false, 'threw: ' + e.message.slice(0, 80)); }

try { // PR-02 refresh recovery
  await page.reload({ waitUntil: 'domcontentloaded' });
  const cards = await page.$$eval('#mindGrid .mind-card', c => c.length);
  const hist2 = await page.evaluate(() => JSON.parse(localStorage.getItem('freemasonry-circle.council.history') || '[]'));
  record('PR-02', cards >= 60 && hist2.length === 1 && pageErrors.length === 0, 'clean boot after reload, history intact, no page errors');
} catch (e) { record('PR-02', false, 'threw: ' + e.message.slice(0, 80)); }

try { // PR-03 abandon then reconvene
  await page.click('#councilBtn');
  await page.fill('#councilQuestion', 'First run, to be abandoned?');
  await page.click('#councilConvene');
  await page.click('#councilBack');
  await page.click('#councilBtn');
  await page.fill('#councilQuestion', 'Second run, which must own the document?');
  await page.click('#councilConvene');
  await page.waitForSelector('#councilConsolidated:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const q = await page.textContent('#councilReportQ');
  record('PR-03', q.includes('Second run'), 'the newer run owns the report after an abandoned one');
} catch (e) { record('PR-03', false, 'threw: ' + e.message.slice(0, 80)); }

/* ── Accessibility ── */
try { // AX-01 aria-pressed
  await page.click('#councilAgain').catch(() => {});
  await page.fill('#councilFilter', 'Curie');
  const before = await page.$eval('.pick', b => b.getAttribute('aria-pressed'));
  await page.click('.pick');
  const after = await page.$eval('.pick', b => b.getAttribute('aria-pressed'));
  record('AX-01', before === 'false' && after === 'true', 'seat buttons expose aria-pressed toggle state');
} catch (e) { record('AX-01', false, 'threw: ' + e.message.slice(0, 80)); }

try { // AX-02 keyboard-only convene
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.click('#councilBtn'); // entry via pointer; the flow inside is keyboard-only
  await page.fill('#councilFilter', 'Aristotle');
  await page.focus('.pick');
  await page.keyboard.press('Enter');
  await page.focus('#councilQuestion');
  await page.keyboard.type('Can a council be convened by keyboard alone?');
  await page.focus('#councilConvene');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#councilConsolidated:not([hidden])', { timeout: 20000 });
  record('AX-02', true, 'council convened by keyboard alone');
} catch (e) { record('AX-02', false, 'threw: ' + e.message.slice(0, 80)); }

console.log('\nNot applicable (documented in fixtures.json): ' + FIX.notApplicable.map(x => x.group).join(', '));
console.log('page errors: ' + (pageErrors.length ? pageErrors.join(' | ') : 'NONE'));
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
if (failures.length) console.log(failures.join('\n'));
await browser.close();
process.exit(fail || pageErrors.length ? 1 : 0);
