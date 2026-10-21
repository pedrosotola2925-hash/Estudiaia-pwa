import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DBSchema, openDB } from 'idb';
import { createSettingsStoreWeb } from '@services/settings-web';
import { createSettingsStoreWebWrapper } from '@services/settings-web-store';
import { getSettingsBridge, resetSettingsBridge } from '@services/settings-bridge';

const MASTER_PASSWORD = 'CorrectHorseBatteryStaple!2026';
const WRONG_PASSWORD = 'WrongHorseBatteryStaple!2026';
const EXAMPLE_SECRET = 'example-secret-value-123!';

interface EncryptedRecord {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  salt: Uint8Array;
}

interface SecretsTestDatabase extends DBSchema {
  secrets: {
    key: string;
    value: EncryptedRecord;
  };
}

const testWindow = {
  crypto: webcrypto as unknown as Crypto,
  isSecureContext: true,
  addEventListener: vi.fn(),
};

let databaseSequence = 0;

function nextDatabaseName(prefix: string): string {
  databaseSequence += 1;
  return `${prefix}-${databaseSequence}`;
}

beforeAll(() => {
  vi.stubGlobal('window', testWindow);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('encrypted web settings store', () => {
  it('starts locked and rejects every encrypted secret operation', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('locked-by-default'),
      storeName: 'secrets',
    });

    expect(store.isLocked()).toBe(true);
    await expect(store.get('geminiKey')).rejects.toThrow(/locked/i);
    await expect(store.set('geminiKey', EXAMPLE_SECRET)).rejects.toThrow(/locked/i);
    await expect(store.remove('geminiKey')).rejects.toThrow(/locked/i);
    await expect(store.clear()).rejects.toThrow(/locked/i);
  });

  it('requires a strong master password before a first unlock', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('strong-first-unlock'),
      storeName: 'secrets',
    });

    await expect(store.unlock('short')).rejects.toThrow(/password/i);
    expect(store.isLocked()).toBe(true);
  });

  it('uses the explicitly unlocked session to encrypt and decrypt a secret', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('first-unlock'),
      storeName: 'secrets',
    });

    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', EXAMPLE_SECRET);

    expect(store.isLocked()).toBe(false);
    await expect(store.get('geminiKey')).resolves.toBe(EXAMPLE_SECRET);
  });

  it('keeps the store locked after an incorrect unlock when encrypted data exists', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('wrong-unlock'),
      storeName: 'secrets',
    });

    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', EXAMPLE_SECRET);
    store.lock();

    await expect(store.unlock(WRONG_PASSWORD)).rejects.toThrow(/invalid password/i);
    expect(store.isLocked()).toBe(true);
    await expect(store.get('geminiKey')).rejects.toThrow(/locked/i);
  });

  it('persists a ciphertext record with a 256-bit salt instead of the secret plaintext', async () => {
    const dbName = nextDatabaseName('encrypted-record');
    const store = createSettingsStoreWeb({ dbName, storeName: 'secrets' });

    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', EXAMPLE_SECRET);

    const database = await openDB<SecretsTestDatabase>(dbName);
    const record = await database.get('secrets', 'geminiKey');
    database.close();

    if (!record) {
      throw new Error('Expected encrypted secret record');
    }
    expect(record.salt).toHaveLength(32);
    expect(record.iv).toHaveLength(12);
    expect(new TextDecoder().decode(record.ciphertext)).not.toContain(EXAMPLE_SECRET);
  });

  it('rejects encrypted operations outside a secure context', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('insecure-context'),
      storeName: 'secrets',
    });
    testWindow.isSecureContext = false;

    try {
      await expect(store.isEncryptionAvailable()).resolves.toBe(false);
      await expect(store.unlock(MASTER_PASSWORD)).rejects.toThrow(/secure context/i);
      expect(store.isLocked()).toBe(true);
    } finally {
      testWindow.isSecureContext = true;
    }
  });
});

describe('web settings wrapper', () => {
  it('saves non-secret settings while the encrypted store remains locked', async () => {
    const dbName = nextDatabaseName('non-secret-while-locked');
    const wrapper = createSettingsStoreWebWrapper({ dbName });

    expect(wrapper.isLocked()).toBe(true);
    await expect(wrapper.save({ model: 'gemini-2.0-flash' })).resolves.toMatchObject({
      model: 'gemini-2.0-flash',
    });
    expect(wrapper.isLocked()).toBe(true);

    const reloaded = createSettingsStoreWebWrapper({ dbName });
    await expect(reloaded.getSummary()).resolves.toMatchObject({
      model: 'gemini-2.0-flash',
    });
  });

  it('treats blank secret form fields as unchanged while locked', async () => {
    const wrapper = createSettingsStoreWebWrapper({
      dbName: nextDatabaseName('blank-secret-form-fields'),
    });

    await wrapper.unlock(MASTER_PASSWORD);
    await wrapper.save({ geminiKey: EXAMPLE_SECRET });
    wrapper.lock();

    await expect(wrapper.save({
      model: 'gemini-2.0-flash',
      geminiKey: '',
      youtubeKey: '',
    })).resolves.toMatchObject({
      model: 'gemini-2.0-flash',
      hasGeminiKey: true,
    });
    expect(wrapper.isLocked()).toBe(true);
  });

  it('persists, reads, and clears an encrypted secret through the active wrapper session', async () => {
    const wrapper = createSettingsStoreWebWrapper({
      dbName: nextDatabaseName('wrapper-secret-lifecycle'),
    });

    await wrapper.unlock(MASTER_PASSWORD);
    await wrapper.save({ geminiKey: EXAMPLE_SECRET });

    await expect(wrapper.getSecret('gemini')).resolves.toBe(EXAMPLE_SECRET);
    await expect(wrapper.getSummary()).resolves.toMatchObject({ hasGeminiKey: true });

    await wrapper.clearSecret('gemini');
    await expect(wrapper.getSecret('gemini')).resolves.toBe('');
    await expect(wrapper.getSummary()).resolves.toMatchObject({ hasGeminiKey: false });
  });
});

describe('web settings bridge', () => {
  it('delegates setup, encrypted save, lock, unlock, and clear to the wrapper store', async () => {
    resetSettingsBridge();
    const bridge = getSettingsBridge();

    expect(bridge.isLocked()).toBe(true);
    await bridge.setMasterPassword(MASTER_PASSWORD);
    await bridge.saveSettings({ youtubeKey: EXAMPLE_SECRET });
    await expect(bridge.getSettings()).resolves.toMatchObject({ hasYoutubeKey: true });

    bridge.lock();
    await expect(bridge.saveSettings({ youtubeKey: EXAMPLE_SECRET })).rejects.toThrow(/unlock|locked/i);

    await bridge.unlock(MASTER_PASSWORD);
    await bridge.clearKey('youtube');
    await expect(bridge.getSettings()).resolves.toMatchObject({ hasYoutubeKey: false });
  });
});