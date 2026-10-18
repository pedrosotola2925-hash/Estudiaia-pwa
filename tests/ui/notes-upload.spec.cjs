const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');

async function installNotesMock(app) {
  await app.evaluate(({ ipcMain }) => {
    globalThis.__estudiaNoteCalls = [];
    ipcMain.removeHandler('estudia:generate');
    ipcMain.handle('estudia:generate', async (_event, payload) => {
      globalThis.__estudiaNoteCalls.push(payload);
      return { ok: true, value: { text: `Análisis de ${payload.file?.name || 'sin archivo'}.` } };
    });
  });
}

test('valid PDF requires confirmation and sends the selected file only after acceptance', async () => {
  const { app, page, close } = await launch();
  try {
    await installNotesMock(app);
    await page.locator('#uploadNotesBtn').click();
    await page.locator('#file-apuntes').setInputFiles({
      name: 'nota.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%Test')
    });
    await expect(page.locator('#confirm-analyze')).toBeVisible();
    await expect.poll(() => app.evaluate(() => globalThis.__estudiaNoteCalls.length)).toBe(0);

    await page.locator('#confirm-analyze').click();
    await expect(page.locator('#respuestas')).toContainText('Análisis de nota.pdf.');
    await expect.poll(() => app.evaluate(() => globalThis.__estudiaNoteCalls[0]?.file?.name)).toBe('nota.pdf');
  } finally {
    await close();
  }
});

test('cancel clears the pending note without sending it', async () => {
  const { app, page, close } = await launch();
  try {
    await installNotesMock(app);
    await page.locator('#uploadNotesBtn').click();
    await page.locator('#file-apuntes').setInputFiles({
      name: 'nota.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%Test')
    });
    await page.locator('#confirm-cancel').click();
    await expect(page.locator('#upload-confirmation')).toBeHidden();
    await expect.poll(() => app.evaluate(() => globalThis.__estudiaNoteCalls.length)).toBe(0);
  } finally {
    await close();
  }
});

test('rejects empty oversized spoofed SVG and filename mismatch files', async () => {
  const { page, close } = await launch();
  try {
    await page.locator('#uploadNotesBtn').click();
    for (const file of [
      { name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
      { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) },
      { name: 'mal.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<?xml') },
      { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg>') },
      { name: 'a.pdf', mimeType: 'image/jpeg', buffer: Buffer.from('%PDF') }
    ]) {
      await page.locator('#file-apuntes').setInputFiles(file);
      await expect(page.locator('#upload-confirmation [role="alert"]')).toBeVisible();
    }
  } finally {
    await close();
  }
});
