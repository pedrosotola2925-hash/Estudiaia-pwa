import { test, expect } from '@playwright/test';

type PwaWindow = Window & {
  Estudia?: { ready?: boolean };
  __speakCalls?: string[];
};

const MASTER_PASSWORD = 'prueba-maestra-2026';
const TEST_MODEL = 'gemini-3.5-flash-lite';
const TEST_GEMINI_KEY = 'AIzaSyPrueba-No-Real-Solo-Cifrado';

async function waitUntilAppReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as unknown as PwaWindow).Estudia?.ready === true,
    undefined,
    { timeout: 30000 },
  );
}

async function waitUntilServiceWorkerActive(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    async () => Boolean((await navigator.serviceWorker?.getRegistration())?.active),
    undefined,
    { timeout: 30000 },
  );
}

async function openSettings(page: import('@playwright/test').Page) {
  await page.locator('[data-vista="ajustes"]').click();
  await expect(page.locator('#settings-form')).toBeVisible();
}

async function readyAndControlled(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitUntilAppReady(page);
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: 30000 },
  );
  await page.waitForLoadState('load');
  await waitUntilAppReady(page);
}

test.describe('PWA e2e', () => {
  test('service worker registers and controls the page', async ({ page }) => {
    await page.goto('/');
    await waitUntilAppReady(page);

    // Wait for SW to be controlling the page (the SW registration triggers a reload when it takes control)
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      undefined,
      { timeout: 30000 },
    );

    // After the reload, verify the SW is active and controlling
    await page.waitForLoadState('load');
    await waitUntilAppReady(page);
    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!reg.active, controlling: !!navigator.serviceWorker.controller } : null;
    });
    expect(registration).not.toBeNull();
    expect(registration?.controlling).toBe(true);
  });

  test('ajustes offers no unlock, key or model control and no provider action', async ({ page }) => {
    await readyAndControlled(page);
    await openSettings(page);

    // A fresh PWA never asks for a master password or a provider key.
    await expect(page.locator('#settings-master-password')).toHaveCount(0);
    await expect(page.locator('#settings-gemini-key')).toHaveCount(0);
    await expect(page.locator('#settings-youtube-key')).toHaveCount(0);
    await expect(page.locator('#settings-model')).toHaveCount(0);
    await expect(page.locator('#check-gemini')).toHaveCount(0);
    await expect(page.locator('#check-youtube')).toHaveCount(0);
    await expect(page.locator('#clear-gemini')).toHaveCount(0);
    await expect(page.locator('#clear-youtube')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Desbloquear claves' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bloquear ahora' })).toHaveCount(0);
    await expect(page.getByText('Contraseña maestra')).toHaveCount(0);

    // The site owns the AI and video services; only voice and rate remain.
    await expect(page.locator('#vista-ajustes')).toContainText('los administra el sitio');
    await expect(page.locator('#vista-ajustes')).toContainText('internet');
    await expect(page.locator('#connection-status')).toHaveText('IA del sitio');

    // Voice and rate controls survive.
    await expect(page.locator('#settings-rate')).toBeVisible();
    await expect(page.locator('#settings-save')).toBeVisible();

    // The voice selector and its preview still work on the home view.
    await page.locator('[data-vista="inicio"]').click();
    await expect(page.locator('#voice-select')).toBeVisible();
    await expect(page.locator('#voice-preview')).toBeVisible();
  });

  test('voice and rate preferences persist across a reload', async ({ page }) => {
    await readyAndControlled(page);

    await page.evaluate(async () => {
      const settings = (window as unknown as { Estudia?: { context?: { settings?: { saveSettings: (patch: { voice: string; rate: number }) => Promise<unknown> } } } }).Estudia?.context?.settings;
      if (!settings) throw new Error('Settings bridge not available');
      await settings.saveSettings({ voice: 'es-CL-CatalinaNeural', rate: 30 });
    });

    await page.reload();
    await readyAndControlled(page);

    const stored = await page.evaluate(async () => {
      const settings = (window as unknown as { Estudia?: { context?: { settings?: { getSettings: () => Promise<{ voice: string; rate: number }> } } } }).Estudia?.context?.settings;
      if (!settings) throw new Error('Settings bridge not available');
      return await settings.getSettings();
    });

    expect(stored).toEqual({ voice: 'es-CL-CatalinaNeural', rate: 30 });

    // The UI reflects the persisted preferences after the reload.
    await openSettings(page);
    await expect(page.locator('#voice-select')).toHaveValue('es-CL-CatalinaNeural');
    await expect(page.locator('#settings-rate')).toHaveValue('30');
    await expect(page.locator('#rate-label')).toHaveText('30 %');
  });

  test('voice plays through the Web Speech API', async ({ page }) => {
    // speechSynthesis may not be available in headless Chrome; skip if so
    const hasSpeechSynthesis = await page.evaluate(() => 'speechSynthesis' in window);
    if (!hasSpeechSynthesis) {
      test.skip();
      return;
    }

    await page.addInitScript(() => {
      const synthesis = window.speechSynthesis;
      const original = synthesis.speak.bind(synthesis);
      (window as unknown as PwaWindow).__speakCalls = [];
      synthesis.speak = (utterance) => {
        (window as unknown as PwaWindow).__speakCalls?.push(String(utterance.text));
        return original(utterance);
      };
    });

    await page.goto('/');
    await waitUntilAppReady(page);
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      undefined,
      { timeout: 30000 },
    );
    await page.waitForLoadState('load');
    await waitUntilAppReady(page);
    await expect(page.locator('#voice-preview')).toBeVisible();
    await page.locator('#voice-preview').click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as PwaWindow).__speakCalls?.length ?? 0))
      .toBeGreaterThan(0);
  });
});
