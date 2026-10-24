const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');
const fs = require('node:fs');
const path = require('node:path');

const MAX_FIRST_FRAGMENT = 500;
const sentence = 'La evolución explica cómo los seres vivos cambian con el tiempo y se adaptan a su ambiente. ';
const longLesson = Array.from({ length: 18 }, () => sentence).join('');

async function installVoiceMock(app) {
  const base64 = fs.readFileSync(path.resolve(__dirname, '../fixtures/voice-sample.mp3')).toString('base64');

  await app.evaluate(({ ipcMain }, audio) => {
    globalThis.__voiceChunks = [];
    ipcMain.removeHandler('estudia:speak');
    ipcMain.handle('estudia:speak', async (_event, payload) => {
      globalThis.__voiceChunks.push(payload.text);
      return { ok: true, value: { base64: audio, mime: 'audio/mpeg' } };
    });
  }, base64);
}

test('una lectura larga comienza con un fragmento breve y continúa al terminarlo', async () => {
  const { app, page, close } = await launch();
  try {
    await installVoiceMock(app);

    await page.evaluate(text => window.Estudia.voice.play(text), longLesson);

    await expect.poll(() => app.evaluate(() => globalThis.__voiceChunks.length)).toBeGreaterThanOrEqual(1);
    const firstLength = await app.evaluate(() => globalThis.__voiceChunks[0].length);
    expect(firstLength).toBeLessThanOrEqual(MAX_FIRST_FRAGMENT);

    await page.locator('#tts-audio').evaluate(audio => audio.dispatchEvent(new Event('ended')));
    await expect.poll(() => app.evaluate(() => globalThis.__voiceChunks.length)).toBeGreaterThanOrEqual(2);
  } finally {
    await close();
  }
});
