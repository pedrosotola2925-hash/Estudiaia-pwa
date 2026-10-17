const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');
const path = require('node:path');

const INSTALLED_EXE = process.env.ESTUDIAIA_INSTALLED_EXE || path.resolve(
  process.env.LOCALAPPDATA,
  'Programs/EstudiaIA 2/EstudiaIA 2.exe'
);

const MOCK_RESPONSE = `### 📌 ¿Qué es?
Definición de prueba.
### 🎯 Analogía fácil
Analogía de prueba.
### 🧩 Explicación paso a paso
1. Paso uno.
2. Paso dos.
### 🌍 ¿Dónde lo ves en tu vida?
Ejemplo.
### ❗ Errores típicos en la prueba
Error.
### 💡 Dato curioso
Curioso.
### ⭐ Recuerda
Resumen.
[[PREGUNTA]]
Test
A) Uno
B) Dos
CORRECTA: A
[[FIN_PREGUNTA]]`;

test.describe.configure({ retries: 0 });

test('installed app launches and shows Mexican voice', async () => {
  const { app, page, close } = await launch({ installed: true });
  try {
    await expect(page).toHaveTitle('EstudiaIA 2', { timeout: 10000 });
    await expect(page.locator('#voice-select')).toHaveValue('es-MX-DaliaNeural', { timeout: 5000 });
    await expect(page.locator('[data-vista="inicio"]')).toHaveAttribute('aria-current', 'page');
  } finally {
    await close();
  }
});

test('installed app can ask a question and get response', async () => {
  const { app, page, close } = await launch({ installed: true });
  try {
    await expect(page.locator('#searchInput')).toBeVisible({ timeout: 10000 });

    await app.evaluate(({ ipcMain }, response) => {
      ipcMain.removeHandler('estudia:generate');
      ipcMain.handle('estudia:generate', async () => {
        return { ok: true, value: { text: response } };
      });
    }, MOCK_RESPONSE);

    await page.locator('#searchInput').fill('test question');
    await page.locator('#searchBtn').click();
    await expect(page.locator('#respuestas')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#respuestas')).toContainText('Definición de prueba');
  } finally {
    await close();
  }
});

test('installed app voice preview works', async () => {
  const { app, page, close } = await launch({ installed: true });
  try {
    await expect(page.locator('#voice-preview')).toBeVisible({ timeout: 5000 });
    await page.locator('#voice-preview').click();
    await expect.poll(() => page.locator('#tts-audio').evaluate(a => a.currentTime)).toBeGreaterThan(0, { timeout: 10000 });
    await expect(page.locator('#voice-status')).toContainText('Leyendo');
  } finally {
    await close();
  }
});
