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

async function unlockKeys(page: import('@playwright/test').Page, password: string) {
  await page.locator('[data-vista="ajustes"]').click();
  await page.locator('#settings-master-password').fill(password);
  await page.getByRole('button', { name: 'Desbloquear claves' }).click();
  await expect(page.locator('#settings-status')).toContainText('desbloqueadas', { timeout: 30000 });
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
    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { scope: reg.scope, active: !!reg.active, controlling: !!navigator.serviceWorker.controller } : null;
    });
    expect(registration).not.toBeNull();
    expect(registration?.controlling).toBe(true);
  });

  test('settings persist across reload and stay encrypted at rest', async ({ page }) => {
    await page.goto('/');
    await waitUntilAppReady(page);

    // Unlock and save settings via the settings bridge directly to avoid UI flakiness
    await page.evaluate(async (password) => {
      const settings = (window as unknown as { Estudia?: { context?: { settings?: { unlock: (p: string) => Promise<void>; saveSettings: (patch: { model: string; geminiKey: string } ) => Promise<unknown> } } } }).Estudia?.context?.settings;
      if (!settings) throw new Error('Settings bridge not available');
      await settings.unlock(password);
      await settings.saveSettings({ model: 'gemini-3.5-flash-lite', geminiKey: 'AIzaSyPrueba-No-Real-Solo-Cifrado' });
    }, MASTER_PASSWORD);

    await page.reload();
    await waitUntilAppReady(page);

    // Unlock again and verify persistence
    await page.evaluate(async (password) => {
      const settings = (window as unknown as { Estudia?: { context?: { settings?: { unlock: (p: string) => Promise<void>; getSettings: () => Promise<{ model: string; hasGeminiKey: boolean }> } } } }).Estudia?.context?.settings;
      if (!settings) throw new Error('Settings bridge not available');
      await settings.unlock(password);
      return await settings.getSettings();
    }, MASTER_PASSWORD).then((result) => {
      expect(result.model).toBe('gemini-3.5-flash-lite');
      expect(result.hasGeminiKey).toBe(true);
    });

    // Verify encryption at rest - secret not in plaintext storage
    const leaked = await page.evaluate(async (secret) => {
      const stored: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        stored.push(localStorage.getItem(localStorage.key(index) as string) ?? '');
      }
      for (let index = 0; index < sessionStorage.length; index += 1) {
        stored.push(sessionStorage.getItem(sessionStorage.key(index) as string) ?? '');
      }

      const databases = await (indexedDB.databases?.() ?? []);
      for (const entry of databases) {
        if (!entry.name) continue;
        const database: IDBDatabase = await new Promise((resolve, reject) => {
          const request = indexedDB.open(entry.name as string);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const storeName of Array.from(database.objectStoreNames)) {
          const rows: string[] = await new Promise((resolve, reject) => {
            const request = database.transaction(storeName).objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result.map((value) => JSON.stringify(value)));
            request.onerror = () => reject(request.error);
          });
          stored.push(...rows);
        }
      }
      return stored.some((value) => value.includes(secret));
    }, 'AIzaSyPrueba-No-Real-Solo-Cifrado');

    expect(leaked).toBe(false);
  });

  test('voice plays through the Web Speech API', async ({ page }) => {
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
    await expect(page.locator('#voice-preview')).toBeVisible();
    await page.locator('#voice-preview').click();

    await expect
      .poll(() => page.evaluate(() => (window as unknown as PwaWindow).__speakCalls?.length ?? 0))
      .toBeGreaterThan(0);
  });
});
