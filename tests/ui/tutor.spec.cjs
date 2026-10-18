const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');

async function installTutorMock(app) {
  await app.evaluate(({ ipcMain }) => {
    globalThis.__estudiaGenerateCalls = [];
    ipcMain.removeHandler('estudia:generate');
    ipcMain.handle('estudia:generate', async (_event, payload) => {
      globalThis.__estudiaGenerateCalls.push(payload);
      if (payload.text === 'lenta') {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return {
        ok: true,
        value: { text: `Respuesta para ${payload.text || payload.file?.name || 'apuntes'} en ${payload.course}.` }
      };
    });
  });
}

test('subjects render and selecting one shows its units', async () => {
  const { page, close } = await launch();
  try {
    await page.locator('[data-vista="materias"]').click();
    await expect(page.locator('[data-subject]')).toHaveCount(6);
    await page.locator('[data-subject="matematica"] button').click();
    await expect(page.locator('#materias-cont')).toContainText('Álgebra');
    await expect(page.locator('#materias-cont')).toContainText('Geometría');
  } finally {
    await close();
  }
});

test('tutor sends the selected course and presents response controls', async () => {
  const { app, page, close } = await launch();
  try {
    await installTutorMock(app);
    await page.locator('#searchInput').fill('fracciones');
    await page.locator('#searchBtn').click();
    await expect(page.locator('#respuestas')).toContainText('Respuesta para fracciones en 7º básico.');
    await expect(page.locator('#btn-entendi')).toBeVisible();
    await expect(page.locator('#btn-otra')).toBeVisible();

    await page.locator('#sel-curso').selectOption('8º básico');
    await page.locator('#searchInput').fill('ecuaciones');
    await page.locator('#searchBtn').click();
    await expect(page.locator('#respuestas')).toContainText('Respuesta para ecuaciones en 8º básico.');
  } finally {
    await close();
  }
});

test('a late tutor reply cannot overwrite a newer reply', async () => {
  const { app, page, close } = await launch();
  try {
    await installTutorMock(app);
    await page.locator('#searchInput').fill('lenta');
    await page.locator('#searchBtn').click();
    await page.locator('#searchInput').fill('rápida');
    await page.locator('#searchBtn').click();
    await expect(page.locator('#respuestas')).toContainText('Respuesta para rápida en 7º básico.');
    await page.waitForTimeout(250);
    await expect(page.locator('#respuestas')).not.toContainText('Respuesta para lenta');
  } finally {
    await close();
  }
});

test('ask resolves after its response has rendered', async () => {
  const { app, page, close } = await launch();
  try {
    await installTutorMock(app);
    const rendered = await page.evaluate(async () => {
      await window.Estudia.features.tutor.ask('lenta');
      return document.getElementById('respuestas').textContent;
    });
    expect(rendered).toContain('Respuesta para lenta en 7º básico.');
  } finally {
    await close();
  }
});
