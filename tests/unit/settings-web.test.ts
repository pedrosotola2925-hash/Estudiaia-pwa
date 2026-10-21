import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { createSettingsStoreWeb } from '@services/settings-web';
import { createSettingsStoreWebWrapper } from '@services/settings-web-store';
import { getSettingsBridge, resetSettingsBridge } from '@services/settings-bridge';

const MASTER_PASSWORD = 'CorrectHorseBatteryStaple!2026';
const WRONG_PASSWORD = 'WrongHorseBatteryStaple!2026';
const EXAMPLE_SECRET = 'example-secret-value-123!';
const ORIGINAL_SECRET = 'original-secret-value-123!';
const REPLACEMENT_SECRET = 'replacement-secret-value-456!';

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

interface PlainSettingsTestDatabase extends DBSchema {
  settings: {
    key: string;
    value: {
      model: string;
      voice: string;
      rate: number;
    };
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

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createCryptoWithDeferredOperation(operation: 'encrypt' | 'decrypt') {
  const started = createDeferred<void>();
  const release = createDeferred<void>();
  const delayedOperation = async (...args: unknown[]): Promise<ArrayBuffer> => {
    started.resolve();
    await release.promise;
    return (webcrypto.subtle[operation] as (...values: unknown[]) => Promise<ArrayBuffer>)(...args);
  };
  const subtle = new Proxy(webcrypto.subtle, {
    get(target, property) {
      if (property === operation) return delayedOperation;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return {
    crypto: {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      subtle,
    } as unknown as Crypto,
    started,
    release,
  };
}

async function createStoreWithDeferredIndexedDBOperation(
  method: 'put' | 'delete' | 'clear',
  dbName = nextDatabaseName(`deferred-${method}`),
) {
  const started = createDeferred<void>();
  const release = createDeferred<void>();

  vi.resetModules();
  vi.doMock('idb', async (importOriginal) => {
    const actual = await importOriginal<typeof import('idb')>();
    return {
      ...actual,
      openDB: async (...args: unknown[]) => {
        const database = await (actual.openDB as (...values: unknown[]) => Promise<IDBPDatabase<SecretsTestDatabase>>)(...args);
        const deferMutation = (target: object, value: unknown) => (...methodArgs: unknown[]) => {
          started.resolve();
          return release.promise.then(() => (value as (...values: unknown[]) => unknown).apply(target, methodArgs));
        };
        const proxyStore = (store: object) => new Proxy(store, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === method) return deferMutation(target, value);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        const proxyTransaction = (transaction: object) => new Proxy(transaction, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === 'store') return proxyStore(value as object);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return new Proxy(database, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === method) {
              return deferMutation(target, value);
            }
            if (property === 'transaction') {
              return (...transactionArgs: unknown[]) => proxyTransaction(
                (value as (...values: unknown[]) => object).apply(target, transactionArgs),
              );
            }
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      },
    };
  });

  const { createSettingsStoreWeb: createIsolatedSettingsStore } = await import('@services/settings-web');
  return {
    store: createIsolatedSettingsStore({
      dbName,
      storeName: 'secrets',
    }),
    dbName,
    started,
    release,
  };
}

async function readEncryptedRecord(dbName: string, key: string): Promise<EncryptedRecord> {
  const database = await openDB<SecretsTestDatabase>(dbName);
  const record = await database.get('secrets', key);
  database.close();
  if (!record) throw new Error(`Expected encrypted record for ${key}`);
  return record;
}

async function seedEncryptedSecret(dbName: string, key: string, value: string): Promise<void> {
  const seedStore = createSettingsStoreWeb({ dbName, storeName: 'secrets' });
  await seedStore.unlock(MASTER_PASSWORD);
  await seedStore.set(key, value);
  seedStore.lock();
}

beforeAll(() => {
  vi.stubGlobal('window', testWindow);
});

afterEach(() => {
  testWindow.crypto = webcrypto as unknown as Crypto;
  testWindow.isSecureContext = true;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('idb');
  vi.resetModules();
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

describe('encrypted web settings session expiry and invalidation', () => {
  it('enforces wall-clock expiry before every sensitive operation without firing the timer', async () => {
    const startedAt = new Date('2030-01-01T00:00:00.000Z');
    const clock = vi.spyOn(Date, 'now');
    const sensitiveOperations = [
      (store: ReturnType<typeof createSettingsStoreWeb>) => store.get('geminiKey'),
      (store: ReturnType<typeof createSettingsStoreWeb>) => store.set('youtubeKey', EXAMPLE_SECRET),
      (store: ReturnType<typeof createSettingsStoreWeb>) => store.remove('geminiKey'),
      (store: ReturnType<typeof createSettingsStoreWeb>) => store.clear(),
    ];

    for (const operation of sensitiveOperations) {
      clock.mockReturnValue(startedAt.getTime());
      const store = createSettingsStoreWeb({
        dbName: nextDatabaseName('wall-clock-expiry'),
        storeName: 'secrets',
      });
      await store.unlock(MASTER_PASSWORD);
      await store.set('geminiKey', EXAMPLE_SECRET);

      clock.mockReturnValue(startedAt.getTime() + (10 * 60 * 1000) + 1);

      await expect(operation(store)).rejects.toThrow(/locked/i);
      expect(store.isLocked()).toBe(true);
    }
  });

  it('does not let a late unlock completion overwrite a manual lock', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('unlock-invalidation'),
      storeName: 'secrets',
    });
    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', EXAMPLE_SECRET);
    store.lock();

    const delayedDecrypt = createCryptoWithDeferredOperation('decrypt');
    testWindow.crypto = delayedDecrypt.crypto;
    const pendingUnlock = store.unlock(MASTER_PASSWORD);
    await delayedDecrypt.started.promise;
    store.lock();
    delayedDecrypt.release.resolve();

    await expect(pendingUnlock).rejects.toThrow(/locked/i);
    expect(store.isLocked()).toBe(true);
  });

  it('does not return plaintext when locked during decrypt', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('get-invalidation'),
      storeName: 'secrets',
    });
    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', EXAMPLE_SECRET);

    const delayedDecrypt = createCryptoWithDeferredOperation('decrypt');
    testWindow.crypto = delayedDecrypt.crypto;
    const pendingGet = store.get('geminiKey');
    await delayedDecrypt.started.promise;
    store.lock();
    delayedDecrypt.release.resolve();

    await expect(pendingGet).rejects.toThrow(/locked/i);
  });

  it('prevents a secret write when locked before encryption completes', async () => {
    const store = createSettingsStoreWeb({
      dbName: nextDatabaseName('set-invalidation'),
      storeName: 'secrets',
    });
    await store.unlock(MASTER_PASSWORD);

    const delayedEncrypt = createCryptoWithDeferredOperation('encrypt');
    testWindow.crypto = delayedEncrypt.crypto;
    const pendingSet = store.set('youtubeKey', EXAMPLE_SECRET);
    await delayedEncrypt.started.promise;
    store.lock();
    delayedEncrypt.release.resolve();

    await expect(pendingSet).rejects.toThrow(/locked/i);
    testWindow.crypto = webcrypto as unknown as Crypto;
    await store.unlock(MASTER_PASSWORD);
    await expect(store.has('youtubeKey')).resolves.toBe(false);
  });

  it('aborts a pending IndexedDB put when locked and preserves the original ciphertext', async () => {
    const dbName = nextDatabaseName('put-rollback-on-lock');
    await seedEncryptedSecret(dbName, 'geminiKey', ORIGINAL_SECRET);
    const before = await readEncryptedRecord(dbName, 'geminiKey');
    const { store, started, release } = await createStoreWithDeferredIndexedDBOperation('put', dbName);
    await store.unlock(MASTER_PASSWORD);

    const pendingSet = store.set('geminiKey', REPLACEMENT_SECRET);
    await started.promise;
    store.lock();
    const rejection = expect(pendingSet).rejects.toThrow(/locked/i);
    release.resolve();
    await rejection;

    await store.unlock(MASTER_PASSWORD);
    await expect(store.get('geminiKey')).resolves.toBe(ORIGINAL_SECRET);
    await expect(readEncryptedRecord(dbName, 'geminiKey')).resolves.toEqual(before);
  });

  it('aborts a pending IndexedDB delete when locked and preserves the original ciphertext', async () => {
    const dbName = nextDatabaseName('delete-rollback-on-lock');
    await seedEncryptedSecret(dbName, 'geminiKey', ORIGINAL_SECRET);
    const before = await readEncryptedRecord(dbName, 'geminiKey');
    const { store, started, release } = await createStoreWithDeferredIndexedDBOperation('delete', dbName);
    await store.unlock(MASTER_PASSWORD);

    const pendingRemove = store.remove('geminiKey');
    await started.promise;
    store.lock();
    const rejection = expect(pendingRemove).rejects.toThrow(/locked/i);
    release.resolve();
    await rejection;

    await store.unlock(MASTER_PASSWORD);
    await expect(store.get('geminiKey')).resolves.toBe(ORIGINAL_SECRET);
    await expect(readEncryptedRecord(dbName, 'geminiKey')).resolves.toEqual(before);
  });

  it('aborts a pending IndexedDB clear when locked and preserves all ciphertext', async () => {
    const dbName = nextDatabaseName('clear-rollback-on-lock');
    await seedEncryptedSecret(dbName, 'geminiKey', ORIGINAL_SECRET);
    await seedEncryptedSecret(dbName, 'youtubeKey', EXAMPLE_SECRET);
    const beforeGemini = await readEncryptedRecord(dbName, 'geminiKey');
    const beforeYoutube = await readEncryptedRecord(dbName, 'youtubeKey');
    const { store, started, release } = await createStoreWithDeferredIndexedDBOperation('clear', dbName);
    await store.unlock(MASTER_PASSWORD);

    const pendingClear = store.clear();
    await started.promise;
    store.lock();
    const rejection = expect(pendingClear).rejects.toThrow(/locked/i);
    release.resolve();
    await rejection;

    await store.unlock(MASTER_PASSWORD);
    await expect(store.get('geminiKey')).resolves.toBe(ORIGINAL_SECRET);
    await expect(store.get('youtubeKey')).resolves.toBe(EXAMPLE_SECRET);
    await expect(readEncryptedRecord(dbName, 'geminiKey')).resolves.toEqual(beforeGemini);
    await expect(readEncryptedRecord(dbName, 'youtubeKey')).resolves.toEqual(beforeYoutube);
  });
});

describe('web settings wrapper', () => {
  it('starts with a default summary when neither IndexedDB store exists yet', async () => {
    const wrapper = createSettingsStoreWebWrapper({
      dbName: nextDatabaseName('fresh-default-layout'),
    });

    await expect(wrapper.getSummary()).resolves.toMatchObject({
      model: 'gemini-3.5-flash-lite',
      hasGeminiKey: false,
      hasYoutubeKey: false,
    });
  });

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

  it('reads legacy encrypted records from the original database and secrets store by default', async () => {
    const dbName = nextDatabaseName('legacy-estudiaia-settings');
    const legacyStore = createSettingsStoreWeb({ dbName, storeName: 'secrets' });
    await legacyStore.unlock(MASTER_PASSWORD);
    await legacyStore.set('geminiKey', EXAMPLE_SECRET);
    legacyStore.lock();

    const wrapper = createSettingsStoreWebWrapper({ dbName });
    await expect(wrapper.getSummary()).resolves.toMatchObject({ hasGeminiKey: true });
    await wrapper.unlock(MASTER_PASSWORD);

    await expect(wrapper.getSecret('gemini')).resolves.toBe(EXAMPLE_SECRET);
  });

  it('reads cccbdb2 plaintext settings and encrypted secrets without changing legacy records', async () => {
    const dbName = nextDatabaseName('cccbdb2-layout');
    const legacySettings = {
      model: 'gemini-2.0-flash',
      voice: 'es-CL-CatalinaNeural',
      rate: 12,
    };
    const configDatabase = await openDB<PlainSettingsTestDatabase>(dbName, 1, {
      upgrade(database) {
        database.createObjectStore('settings');
      },
    });
    await configDatabase.put('settings', legacySettings, 'config');
    configDatabase.close();

    const legacySecrets = createSettingsStoreWeb({
      dbName: `${dbName}-secrets`,
      storeName: 'secrets',
    });
    await legacySecrets.unlock(MASTER_PASSWORD);
    await legacySecrets.set('geminiKey', EXAMPLE_SECRET);
    legacySecrets.lock();
    const legacyCiphertext = await readEncryptedRecord(`${dbName}-secrets`, 'geminiKey');

    const wrapper = createSettingsStoreWebWrapper({ dbName });
    await expect(wrapper.getSummary()).resolves.toEqual({
      ...legacySettings,
      hasGeminiKey: true,
      hasYoutubeKey: false,
    });

    await wrapper.unlock(MASTER_PASSWORD);
    await expect(wrapper.getSecret('gemini')).resolves.toBe(EXAMPLE_SECRET);
    await expect(wrapper.getSummary()).resolves.toEqual({
      ...legacySettings,
      hasGeminiKey: true,
      hasYoutubeKey: false,
    });

    const preservedConfigDatabase = await openDB<PlainSettingsTestDatabase>(dbName);
    await expect(preservedConfigDatabase.get('settings', 'config')).resolves.toEqual(legacySettings);
    preservedConfigDatabase.close();
    await expect(readEncryptedRecord(`${dbName}-secrets`, 'geminiKey')).resolves.toEqual(legacyCiphertext);
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

  it('rejects settings operations when the settings bridge module cannot load', async () => {
    const { initializeWebDesktopBridge } = await import('@services/desktop-bridge');
    const target: { desktop?: Record<string, (...args: never[]) => unknown> } = {};

    await initializeWebDesktopBridge(target, async () => {
      throw new Error('settings bridge chunk unavailable');
    });

    if (!target.desktop) throw new Error('Expected unavailable desktop bridge');
    await expect(target.desktop.getSettings()).rejects.toThrow(/settings bridge unavailable/i);
    await expect(target.desktop.saveSettings()).rejects.toThrow(/settings bridge unavailable/i);
    await expect(target.desktop.clearKey()).rejects.toThrow(/settings bridge unavailable/i);
    expect(target.desktop).not.toHaveProperty('_bridge');
  });

  it('preserves an existing Electron preload bridge', async () => {
    const { initializeWebDesktopBridge } = await import('@services/desktop-bridge');
    const preloadBridge = {
      getSettings: async () => ({ model: 'electron-preload' }),
    };
    const target = { desktop: preloadBridge };
    const loadSettingsBridge = vi.fn(async () => ({ getSettingsBridge }));

    await initializeWebDesktopBridge(target, loadSettingsBridge);

    expect(loadSettingsBridge).not.toHaveBeenCalled();
    expect(target.desktop).toBe(preloadBridge);
  });
});