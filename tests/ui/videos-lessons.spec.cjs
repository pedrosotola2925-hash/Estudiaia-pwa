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

async function installVideoMocks(app, { delayedSearch = false, lesson = validLesson, videos = [validVideo], searchError = null } = {}) {
  await app.evaluate(({ ipcMain }, config) => {
    globalThis.__videoSearchCalls = [];
    globalThis.__openedVideoIds = [];
    ipcMain.removeHandler('estudia:searchVideos');
    ipcMain.handle('estudia:searchVideos', async (_event, payload) => {
      globalThis.__videoSearchCalls.push(payload);
      if (config.delayedSearch) await new Promise(resolve => setTimeout(resolve, 150));
      if (config.searchError) return { ok: false, error: config.searchError };
      return { ok: true, value: config.videos };
    });
    ipcMain.removeHandler('estudia:openVideo');
    ipcMain.handle('estudia:openVideo', async (_event, id) => {
      globalThis.__openedVideoIds.push(id);
      return { ok: true, value: null };
    });
    ipcMain.removeHandler('estudia:generate');
    ipcMain.handle('estudia:generate', async () => ({ ok: true, value: { text: JSON.stringify(config.lesson) } }));
  }, { delayedSearch, lesson, videos, searchError });
}

async function selectMathAndUnit(page, { unit = 'Álgebra' } = {}) {
  await expect(page.locator('#sel-materia-v option')).toHaveCount(7);
  await page.locator('#sel-materia-v').selectOption('matematica');
  await expect(page.locator(`#sel-unidad-v option[value="${unit}"]`)).toHaveCount(1);
  await page.locator('#sel-unidad-v').selectOption({ label: unit });
}

test('changing the video subject does not show a changeSubject runtime error', async () => {
  const { page, close } = await launch();
  try {
    await page.locator('[data-vista="videos"]').click();
    await page.locator('#sel-materia-v').selectOption('matematica');
    await expect(page.locator('#sel-unidad-v option[value="Álgebra"]')).toHaveCount(1);
    await expect(page.locator('#app-message')).not.toContainText('changeSubject');
  } finally {
    await close();
  }
});

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

test('video cache is separated by course and does not search again after returning to saved results', async () => {
  const { app, page, close } = await launch();
  try {
    await installVideoMocks(app);
    await page.locator('[data-vista="videos"]').click();
    await selectMathAndUnit(page);
    await page.locator('#btn-buscar-videos').click();
    await expect.poll(() => app.evaluate(() => globalThis.__videoSearchCalls.length)).toBe(1);

    await page.locator('#sel-curso').selectOption('8º básico');
    await selectMathAndUnit(page, { unit: 'Funciones cuadráticas' });
    await page.locator('#btn-buscar-videos').click();
    await expect.poll(() => app.evaluate(() => globalThis.__videoSearchCalls.length)).toBe(2);

    await page.locator('#sel-curso').selectOption('7º básico');
    await selectMathAndUnit(page);
    await page.locator('#btn-buscar-videos').click();
    await expect.poll(() => app.evaluate(() => globalThis.__videoSearchCalls.length)).toBe(2);
  } finally {
    await close();
  }
});

test('empty results and provider errors leave a clear safe status', async () => {
  const empty = await launch();
  try {
    await installVideoMocks(empty.app, { videos: [] });
    await empty.page.locator('[data-vista="videos"]').click();
    await selectMathAndUnit(empty.page);
    await empty.page.locator('#btn-buscar-videos').click();
    await expect(empty.page.locator('#video-status')).toContainText('No hay resultados');
    await expect(empty.page.locator('[data-video-id]')).toHaveCount(0);
  } finally {
    await empty.close();
  }

  const errored = await launch();
  try {
    await installVideoMocks(errored.app, { searchError: { code: 'NOT_READY', message: 'Configura la clave de YouTube en Ajustes.' } });
    await errored.page.locator('[data-vista="videos"]').click();
    await selectMathAndUnit(errored.page);
    await errored.page.locator('#btn-buscar-videos').click();
    await expect(errored.page.locator('#video-status')).toContainText('Configura la clave de YouTube');
    await expect(errored.page.locator('[data-video-id]')).toHaveCount(0);
  } finally {
    await errored.close();
  }
});

test('late units from a previous course cannot populate the current video view', async () => {
  const { app, page, close } = await launch();
  try {
    await installVideoMocks(app);
    await page.locator('[data-vista="videos"]').click();
    await page.evaluate(() => {
      const original = window.Estudia.features.materias.getUnits;
      let resolve;
      window.__staleUnitRequested = false;
      window.__resolveStaleVideoUnits = value => resolve(value);
      window.Estudia.features.materias.getUnits = async (subjectId, course) => {
        if (subjectId === 'matematica' && course === '7º básico') {
          window.__staleUnitRequested = true;
          return new Promise(done => { resolve = done; });
        }
        return original(subjectId, course);
      };
    });
    await page.locator('#sel-materia-v').selectOption('matematica');
    await page.waitForFunction(() => window.__staleUnitRequested === true);
    await page.locator('#sel-curso').selectOption('8º básico');
    await expect(page.locator('#sel-materia-v')).toHaveValue('');
    await page.evaluate(() => window.__resolveStaleVideoUnits(['Álgebra']));
    await expect(page.locator('#sel-unidad-v option[value="Álgebra"]')).toHaveCount(0);
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

test('invalid lesson payloads never render slides or enter the cache', async () => {
  const invalidLessons = [
    { ...validLesson, slides: [] },
    { ...validLesson, slides: validLesson.slides.slice(0, 3) },
    { ...validLesson, slides: [...validLesson.slides, ...validLesson.slides.slice(0, 3)] },
    { ...validLesson, final: { ...validLesson.final, correcta: 'C' } }
  ];
  for (const lesson of invalidLessons) {
    const { app, page, close } = await launch();
    try {
      await installVideoMocks(app, { lesson });
      await page.locator('[data-vista="videos"]').click();
      await selectMathAndUnit(page);
      await page.locator('#btn-leccion').click();
      await expect(page.locator('[data-lesson]')).toHaveCount(0);
      await expect(page.locator('#video-status')).toContainText('Formato inválido');
      await expect.poll(() => page.evaluate(() => window.Estudia.store.getCache('lesson:7º básico:matematica:Álgebra'))).toBeNull();
    } finally {
      await close();
    }
  }
});
