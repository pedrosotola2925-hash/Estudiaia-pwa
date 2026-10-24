const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');

test('Pomodoro starts in study, keeps time across view changes, and pause does not lose time', async () => {
  const { app, page, close } = await launch();
  try {
    await page.locator('[data-vista="aprender"]').click();
    await expect(page.locator('#pomodoro-display')).toHaveText('25:00');

    await page.locator('#btn-pomodoro-start').click();
    await expect(page.locator('#pomodoro-display')).not.toHaveText('25:00');

    await page.locator('[data-vista="inicio"]').click();
    await page.locator('[data-vista="aprender"]').click();
    await expect(page.locator('#pomodoro-display')).toHaveText('25:00');

    await page.locator('#btn-pomodoro-start').click();
    await expect(page.locator('#pomodoro-display')).not.toHaveText('25:00');
  } finally {
    await close();
  }
});

test('Empty note is rejected; saved note visible after restart', async () => {
  const { app, page, close } = await launch();
  try {
    await page.locator('[data-vista="aprender"]').click();

    await page.locator('#btn-save-note').click();
    await expect(page.locator('#note-status [role="alert"]')).toContainText('vacía');

    await page.locator('#note-text').fill('Nota de prueba de estudio.');
    await page.locator('#btn-save-note').click();
    await expect(page.locator('#note-status')).toContainText('guardada');

    await page.locator('[data-vista="inicio"]').click();
    await page.locator('[data-vista="aprender"]').click();
    await expect(page.locator('#note-text')).toHaveValue('Nota de prueba de estudio.');
  } finally {
    await close();
  }
});

test('Plan rejects past dates and sends today to the provider', async () => {
  const { app, page, close } = await launch();
  try {
    await app.evaluate(({ ipcMain }) => {
      globalThis.__planCalls = [];
      ipcMain.removeHandler('estudia:generate');
      ipcMain.handle('estudia:generate', async (_event, payload) => {
        globalThis.__planCalls.push(payload);
        return { ok: true, value: { text: '[[JSON]]{"titulo":"Plan","slides":[{"emoji":"📖","titulo":"A","texto":"B"},{"emoji":"📖","titulo":"C","texto":"D"},{"emoji":"📖","titulo":"E","texto":"F"},{"emoji":"📖","titulo":"G","texto":"H"}],"final":{"pregunta":"¿?","a":"A","b":"B","correcta":"A"}}[[/JSON]]' } };
      });
    }, {});

    await page.locator('[data-vista="aprender"]').click();

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await page.locator('#plan-date').fill(yesterday);
    await page.locator('#btn-generar-plan').click();
    await expect(page.locator('#plan-status [role="alert"]')).toContainText('fecha');

    const today = new Date().toISOString().slice(0, 10);
    await page.locator('#plan-date').fill(today);
    await page.locator('#btn-generar-plan').click();
    await expect(page.locator('#plan-status')).toContainText('generado');

    await expect.poll(() => app.evaluate(() => globalThis.__planCalls.length)).toBe(1);
    const last = await app.evaluate(() => globalThis.__planCalls[globalThis.__planCalls.length - 1]);
    expect(last.examDate).toBe(today);
    expect(last.context).toBeUndefined();
    expect(last.today).toBeUndefined();
  } finally {
    await close();
  }
});
