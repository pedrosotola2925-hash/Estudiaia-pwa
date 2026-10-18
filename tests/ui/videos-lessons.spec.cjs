const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');

const validVideo = {
  id: 'abcdefghijk',
  title: '<img src=x onerror="window.__videoXss=true"> Fracciones seguras',
  thumbnail: 'javascript:alert(1)'
};

const validLesson = {
  titulo: 'Fracciones equivalentes',
  slides: [
    { emoji: '🍕', titulo: 'Parte de un todo', texto: 'Una fracción representa partes iguales.' },
    { emoji: '➗', titulo: 'Numerador', texto: 'Indica cuántas partes tomamos.' },
    { emoji: '📐', titulo: 'Denominador', texto: 'Indica en cuántas partes se divide el todo.' },
    { emoji: '✅', titulo: 'Equivalencia', texto: 'Multiplicar arriba y abajo por el mismo número conserva el valor.' }
  ],
  final: { pregunta: '¿Cuál es equivalente a 1/2?', a: '2/4', b: '2/3', correcta: 'A' }
};

async function installVideoMocks(app, { delayedSearch = false, lesson = validLesson } = {}) {
  await app.evaluate(({ ipcMain }, config) => {
    globalThis.__videoSearchCalls = [];
    globalThis.__openedVideoIds = [];
    ipcMain.removeHandler('estudia:searchVideos');
    ipcMain.handle('estudia:searchVideos', async (_event, payload) => {
      globalThis.__videoSearchCalls.push(payload);
      if (config.delayedSearch) await new Promise(resolve => setTimeout(resolve, 150));
      return { ok: true, value: [{ id: 'abcdefghijk', title: '<img src=x onerror="window.__videoXss=true"> Fracciones seguras', thumbnail: 'javascript:alert(1)' }] };
    });
    ipcMain.removeHandler('estudia:openVideo');
    ipcMain.handle('estudia:openVideo', async (_event, id) => {
      globalThis.__openedVideoIds.push(id);
      return { ok: true, value: null };
    });
    ipcMain.removeHandler('estudia:generate');
    ipcMain.handle('estudia:generate', async () => ({ ok: true, value: { text: JSON.stringify(config.lesson) } }));
  }, { delayedSearch, lesson });
}

async function selectMathAndUnit(page) {
  await page.locator('#sel-materia-v').selectOption('matematica');
  await expect(page.locator('#sel-unidad-v option[value="Álgebra"]')).toHaveCount(1);
  await page.locator('#sel-unidad-v').selectOption({ label: 'Álgebra' });
}

test('video view fills subjects and units, renders untrusted metadata safely, and offers external playback', async () => {
  const { app, page, close } = await launch();
  try {
    await installVideoMocks(app);
    await page.locator('[data-vista="videos"]').click();
    await expect(page.locator('#sel-materia-v option')).toHaveCount(7);
    await selectMathAndUnit(page);

    await page.locator('#btn-buscar-videos').click();
    await expect(page.locator('[data-video-id="abcdefghijk"]')).toContainText('<img src=x onerror="window.__videoXss=true"> Fracciones seguras');
    expect(await page.evaluate(() => window.__videoXss)).toBeUndefined();
    await expect(page.locator('[data-video-id="abcdefghijk"] img')).toHaveCount(0);
    await expect.poll(() => app.evaluate(() => globalThis.__videoSearchCalls.length)).toBe(1);

    await page.locator('[data-video-id="abcdefghijk"] button:has-text("Ver vídeo")').click();
    await expect(page.locator('iframe[title*="Fracciones seguras"]')).toBeVisible();
    await page.locator('button:has-text("Abrir en YouTube")').click();
    await expect.poll(() => app.evaluate(() => globalThis.__openedVideoIds)).toEqual(['abcdefghijk']);
    await page.locator('button:has-text("Volver a resultados")').click();
    await expect(page.locator('[data-video-id="abcdefghijk"]')).toBeVisible();
  } finally {
    await close();
  }
});

test('a delayed search cannot repopulate the view after changing course', async () => {
  const { app, page, close } = await launch();
  try {
    await installVideoMocks(app, { delayedSearch: true });
    await page.locator('[data-vista="videos"]').click();
    await selectMathAndUnit(page);
    await page.locator('#btn-buscar-videos').click();
    await page.locator('#sel-curso').selectOption('8º básico');
    await page.waitForTimeout(250);
    await expect(page.locator('[data-video-id="abcdefghijk"]')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('a validated lesson records a correct final answer once', async () => {
  const { app, page, close } = await launch();
  try {
    await installVideoMocks(app);
    await page.locator('[data-vista="videos"]').click();
    await selectMathAndUnit(page);
    await page.locator('#btn-leccion').click();
    await expect(page.locator('[data-lesson]')).toContainText('Fracciones equivalentes');
    await expect(page.locator('[data-lesson-slide]')).toHaveCount(4);

    await page.locator('[data-lesson-answer="A"]').click();
    await expect(page.locator('#video-status')).toContainText('Correcto');
    await page.locator('[data-lesson-answer="A"]').click({ force: true });
    await expect.poll(() => page.evaluate(() => {
      const progress = window.Estudia.store.getState().progress['7º básico'];
      return progress?.answeredIds.length || 0;
    })).toBe(1);
  } finally {
    await close();
  }
});

test('invalid lesson payload is rejected without rendering slides', async () => {
  const invalid = { ...validLesson, slides: validLesson.slides.slice(0, 3) };
  const { app, page, close } = await launch();
  try {
    await installVideoMocks(app, { lesson: invalid });
    await page.locator('[data-vista="videos"]').click();
    await selectMathAndUnit(page);
    await page.locator('#btn-leccion').click();
    await expect(page.locator('[data-lesson]')).toHaveCount(0);
    await expect(page.locator('#video-status')).toContainText('Formato inválido');
  } finally {
    await close();
  }
});
