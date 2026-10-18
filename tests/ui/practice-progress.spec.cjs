const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');

const root = path.resolve(__dirname, '../..');
const hostileExplanation = '<img src=x onerror="window.__practiceXss=true"> Explicación segura';
const practice = [
  { p: '¿Cuál es 1 + 1?', o: ['2', '3', '4', '5'], c: 0, e: hostileExplanation },
  { p: '¿Cuál es 2 + 2?', o: ['4', '3', '5', '6'], c: 0, e: 'Sumar dos y dos da cuatro.' },
  { p: '¿Cuál es 3 + 3?', o: ['5', '6', '7', '8'], c: 1, e: 'Tres más tres da seis.' },
  { p: '¿Cuál es 4 + 4?', o: ['6', '7', '8', '9'], c: 2, e: 'Cuatro más cuatro da ocho.' },
  { p: '¿Cuál es 5 + 5?', o: ['9', '10', '11', '12'], c: 1, e: 'Cinco más cinco da diez.' }
];

async function installPracticeMock(app, { questions = practice, delay = false } = {}) {
  await app.evaluate(({ ipcMain }, config) => {
    globalThis.__practiceGenerateCalls = [];
    ipcMain.removeHandler('estudia:generate');
    ipcMain.handle('estudia:generate', async (_event, payload) => {
      globalThis.__practiceGenerateCalls.push(payload);
      if (config.delay) await new Promise(resolve => setTimeout(resolve, 150));
      return { ok: true, value: { text: JSON.stringify(config.questions) } };
    });
  }, { questions, delay });
}

async function selectMathAndUnit(page) {
  await page.locator('[data-vista="practicas"]').click();
  await expect(page.locator('#sel-materia option')).toHaveCount(7);
  await page.locator('#sel-materia').selectOption('matematica');
  await expect(page.locator('#sel-unidad option[value="Álgebra"]')).toHaveCount(1);
  await page.locator('#sel-unidad').selectOption({ label: 'Álgebra' });
}

async function answerPractice(page, { firstDoubleClick = false } = {}) {
  for (let index = 0; index < 5; index += 1) {
    const option = page.locator('[data-practice-option="0"]');
    if (index === 0 && firstDoubleClick) await option.dblclick();
    else await option.click();
    if (index < 4) await expect(page.locator('[data-practice-index]')).toHaveText(String(index + 2));
  }
  await expect(page.locator('#practice-status')).toContainText('Práctica guardada');
}

test('a practice attempt is stored once despite a double click and a new attempt is counted separately', async () => {
  const { app, page, close } = await launch();
  try {
    await installPracticeMock(app);
    await selectMathAndUnit(page);
    await page.locator('#btn-crear-practica').click();
    await expect(page.locator('[data-practice-index]')).toHaveText('1');
    await answerPractice(page, { firstDoubleClick: true });

    await expect.poll(() => page.evaluate(() => window.Estudia.store.getState().progress['7º básico'])).toMatchObject({
      practiceCount: 1,
      subjects: { matematica: { total: 5 } }
    });

    await page.locator('#btn-crear-practica').click();
    await expect(page.locator('[data-practice-index]')).toHaveText('1');
    await answerPractice(page);
    await expect.poll(() => page.evaluate(() => window.Estudia.store.getState().progress['7º básico'].practiceCount)).toBe(2);
  } finally {
    await close();
  }
});

test('practice generation blocks duplicate clicks, validates malformed payloads, and escapes hostile explanations', async () => {
  const delayed = await launch();
  try {
    await installPracticeMock(delayed.app, { delay: true });
    await selectMathAndUnit(delayed.page);
    await delayed.page.locator('#btn-crear-practica').click();
    await delayed.page.locator('#btn-crear-practica').click({ force: true });
    await expect.poll(() => delayed.app.evaluate(() => globalThis.__practiceGenerateCalls.length)).toBe(1);
    await expect(delayed.page.locator('#btn-crear-practica')).toBeDisabled();
    await expect(delayed.page.locator('[data-practice-index]')).toHaveText('1');
    await delayed.page.locator('[data-practice-option="0"]').click();
    await expect(delayed.page.locator('#zona-quiz')).toContainText(hostileExplanation);
    expect(await delayed.page.evaluate(() => window.__practiceXss)).toBeUndefined();
    await expect(delayed.page.locator('#zona-quiz img')).toHaveCount(0);
  } finally {
    await delayed.close();
  }

  const malformed = await launch();
  try {
    const invalid = practice.map(question => ({ ...question }));
    invalid[0].c = 4;
    await installPracticeMock(malformed.app, { questions: invalid });
    await selectMathAndUnit(malformed.page);
    await malformed.page.locator('#btn-crear-practica').click();
    await expect(malformed.page.locator('#practice-status [role="alert"]')).toContainText('Formato inválido');
    await expect(malformed.page.locator('[data-practice-index]')).toHaveCount(0);
  } finally {
    await malformed.close();
  }
});

test('progress is course-scoped, keeps twenty history entries, and does not report save success after a storage failure', async () => {
  const { app, page, close } = await launch();
  try {
    await page.evaluate(() => {
      for (let index = 0; index < 21; index += 1) {
        window.Estudia.store.recordPractice({
          id: `history-${index}`,
          course: '7º básico',
          subjectId: 'matematica',
          correct: 3,
          total: 5,
          at: new Date(2026, 0, index + 1).toISOString()
        });
      }
    });
    await page.locator('[data-vista="progreso"]').click();
    await expect(page.locator('#practice-total')).toHaveText('21');
    await expect(page.locator('[data-practice-history]')).toHaveCount(20);

    await page.locator('#sel-curso').selectOption('8º básico');
    await expect(page.locator('#practice-total')).toHaveText('0');

    await installPracticeMock(app);
    await selectMathAndUnit(page);
    await page.evaluate(() => {
      const original = window.Estudia.store.recordPractice.bind(window.Estudia.store);
      window.Estudia.store.recordPractice = value => {
        window.Estudia.store.recordPractice = original;
        const error = new Error('No se pudo guardar.');
        error.code = 'STORAGE_ERROR';
        throw error;
      };
    });
    await page.locator('#btn-crear-practica').click();
    for (let index = 0; index < 5; index += 1) {
      await page.locator('[data-practice-option="0"]').click();
      if (index < 4) await expect(page.locator('[data-practice-index]')).toHaveText(String(index + 2));
    }
    await expect(page.locator('#practice-status [role="alert"]')).toContainText('No se pudo guardar');
    await expect(page.locator('#practice-status')).not.toContainText('Práctica guardada');
  } finally {
    await close();
  }
});

test('saved practice data survives reopening and open(subjectId) waits for its units', async () => {
  const base = path.join(root, '.build', 'ui-profiles');
  fs.mkdirSync(base, { recursive: true });
  const profile = fs.mkdtempSync(path.join(base, 'practice-reopen-'));
  let first;
  let second;
  try {
    first = await launch({ profile });
    await installPracticeMock(first.app);
    await selectMathAndUnit(first.page);
    await first.page.locator('#btn-crear-practica').click();
    await answerPractice(first.page);
    await first.close();
    first = null;

    second = await launch({ profile });
    await second.page.locator('[data-vista="progreso"]').click();
    await expect(second.page.locator('#practice-total')).toHaveText('1');

    await second.page.evaluate(() => {
      const original = window.Estudia.features.materias.getUnits;
      let resolve;
      window.__practiceOpenDone = null;
      window.__resolvePracticeUnits = units => resolve(units);
      window.Estudia.features.materias.getUnits = async (subjectId, course) => {
        if (subjectId === 'matematica' && course === '7º básico') return new Promise(done => { resolve = done; });
        return original(subjectId, course);
      };
      window.__practiceOpenDone = window.Estudia.features.practicas.open({ subjectId: 'matematica' });
    });
    await expect(second.page.locator('#sel-materia')).toHaveValue('matematica');
    await expect(second.page.locator('#sel-unidad option')).toHaveCount(1);
    await second.page.evaluate(() => window.__resolvePracticeUnits(['Álgebra']));
    await second.page.evaluate(() => window.__practiceOpenDone);
    await expect(second.page.locator('#sel-unidad')).toHaveValue('Álgebra');
  } finally {
    if (first) await first.close();
    if (second) await second.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
