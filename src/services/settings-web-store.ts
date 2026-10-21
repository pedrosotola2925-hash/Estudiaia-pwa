import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { createSettingsStoreWeb } from './settings-web.ts';

const VOICES = ['es-MX-DaliaNeural', 'es-CL-CatalinaNeural'] as const;

interface SettingsSummary {
  model: string;
  voice: string;
  rate: number;
  hasGeminiKey: boolean;
  hasYoutubeKey: boolean;
}

interface SettingsPatch {
  model?: string;
  voice?: string;
  rate?: number;
  geminiKey?: string;
  youtubeKey?: string;
}

export interface SettingsStoreWebWrapper {
  getSummary(): Promise<SettingsSummary>;
  getSecret(provider: 'gemini' | 'youtube'): Promise<string>;
  save(patch: SettingsPatch): Promise<SettingsSummary>;
  clearSecret(provider: 'gemini' | 'youtube'): Promise<SettingsSummary>;
  setMasterPassword(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  isLocked(): boolean;
  isEncryptionAvailable(): Promise<boolean>;
  migrateFromElectron(electronData: unknown): Promise<{ success: boolean; reason?: string }>;
}

interface PlainSettings {
  model: string;
  voice: string;
  rate: number;
}

interface PlainSettingsDBSchema extends DBSchema {
  settings: {
    key: string;
    value: PlainSettings;
  };
}

const DEFAULT_SETTINGS: PlainSettings = {
  model: 'gemini-3.5-flash-lite',
  voice: VOICES[0],
  rate: -5,
};

const SECRET_FIELDS = [
  ['geminiKey', 'gemini'],
  ['youtubeKey', 'youtube'],
] as const;

/**
 * Higher-level settings store that mimics the Electron createSettingsStore interface.
 * Uses IndexedDB for unencrypted settings and settings-web for encrypted secrets.
 * Requires password-based unlock for secret operations.
 */
export function createSettingsStoreWebWrapper(options: {
  dbName?: string;
  settingsDbName?: string;
  secretsDbName?: string;
  storeName?: string;
  settingsStoreName?: string;
} = {}): SettingsStoreWebWrapper {
  const dbName = options.dbName ?? 'estudiaia-settings';
  // New plaintext settings live separately, while reads also fall back to cccbdb2's
  // <dbName>/settings layout without modifying it.
  const settingsDbName = options.settingsDbName ?? `${dbName}-settings`;
  const settingsStoreName = options.settingsStoreName ?? 'settings';
  const legacySettingsDbName = options.settingsDbName === undefined && settingsDbName !== dbName
    ? dbName
    : null;
  // Keep encrypted records at the original Task 2 location: <dbName>/secrets.
  // cccbdb2 stored the same records at <dbName>-secrets/secrets, so retain a
  // read fallback instead of moving or discarding legacy ciphertext.
  const secretsDbName = options.secretsDbName ?? dbName;
  const secretsStoreName = options.storeName ?? 'secrets';
  const legacySecretsDbName = `${dbName}-secrets`;

  const secretsStore = createSettingsStoreWeb({
    dbName: secretsDbName,
    storeName: secretsStoreName,
  });
  const legacySecretsStore = options.secretsDbName === undefined && legacySecretsDbName !== secretsDbName
    ? createSettingsStoreWeb({
      dbName: legacySecretsDbName,
      storeName: secretsStoreName,
    })
    : null;

  let settingsCache: PlainSettings | null = null;
  let settingsDatabase: IDBPDatabase<PlainSettingsDBSchema> | null = null;
  let settingsDatabasePromise: Promise<IDBPDatabase<PlainSettingsDBSchema>> | null = null;

  async function getSettingsDB() {
    if (settingsDatabase) return settingsDatabase;
    if (!settingsDatabasePromise) {
      settingsDatabasePromise = (async () => {
        const existingDatabase = await openDB<PlainSettingsDBSchema>(settingsDbName);
        if (existingDatabase.objectStoreNames.contains(settingsStoreName)) {
          return existingDatabase;
        }

        const nextVersion = existingDatabase.version + 1;
        existingDatabase.close();
        return openDB<PlainSettingsDBSchema>(settingsDbName, nextVersion, {
          upgrade(database) {
            if (!database.objectStoreNames.contains(settingsStoreName)) {
              database.createObjectStore(settingsStoreName);
            }
          },
        });
      })().then((database) => {
        settingsDatabase = database;
        return database;
      }).catch((error) => {
        settingsDatabasePromise = null;
        throw error;
      });
    }
    return settingsDatabasePromise;
  }

  async function loadLegacySettings(): Promise<PlainSettings | null> {
    if (!legacySettingsDbName) return null;
    const database = await openDB<PlainSettingsDBSchema>(legacySettingsDbName);
    try {
      if (!database.objectStoreNames.contains(settingsStoreName)) {
        return null;
      }
      return (await database.get(settingsStoreName, 'config')) ?? null;
    } finally {
      database.close();
    }
  }

  async function loadSettings(): Promise<PlainSettings> {
    if (settingsCache) return settingsCache;
    const database = await getSettingsDB();
    const stored = await database.get(settingsStoreName, 'config');
    if (stored) {
      settingsCache = stored;
      return stored;
    }
    const legacySettings = await loadLegacySettings();
    if (legacySettings) {
      settingsCache = legacySettings;
      return legacySettings;
    }
    settingsCache = { ...DEFAULT_SETTINGS };
    return settingsCache;
  }

  async function saveSettings(settings: PlainSettings): Promise<void> {
    const database = await getSettingsDB();
    await database.put(settingsStoreName, settings, 'config');
    settingsCache = settings;
  }

  function validateVoice(voice: string): boolean {
    return VOICES.includes(voice as typeof VOICES[number]) || /^local:[^\x00-\x1f]{1,150}$/.test(voice);
  }

  function validateModel(model: string): boolean {
    return /^gemini-[a-z0-9.-]{1,90}$/.test(model);
  }

  function validateRate(rate: number): boolean {
    return Number.isInteger(rate) && rate >= -50 && rate <= 50;
  }

  async function hasSecret(key: string): Promise<boolean> {
    if (await secretsStore.has(key)) return true;
    return legacySecretsStore ? legacySecretsStore.has(key) : false;
  }

  async function getSummary(): Promise<SettingsSummary> {
    const settings = await loadSettings();
    const [hasGeminiKey, hasYoutubeKey] = await Promise.all([
      hasSecret('geminiKey'),
      hasSecret('youtubeKey'),
    ]);
    return {
      model: settings.model,
      voice: settings.voice,
      rate: settings.rate,
      hasGeminiKey,
      hasYoutubeKey,
    };
  }

  async function getSecret(provider: 'gemini' | 'youtube'): Promise<string> {
    const key = provider === 'gemini' ? 'geminiKey' : 'youtubeKey';
    const secret = await secretsStore.get(key);
    if (secret !== null || !legacySecretsStore) return secret ?? '';
    return (await legacySecretsStore.get(key)) ?? '';
  }

  async function save(patch: SettingsPatch): Promise<SettingsSummary> {
    const allowedKeys = ['model', 'voice', 'rate', 'geminiKey', 'youtubeKey'];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      Object.keys(patch).some(key => !allowedKeys.includes(key))) {
      throw new Error('Invalid patch');
    }

    const settings = await loadSettings();
    const nextSettings: PlainSettings = { ...settings };
    for (const field of ['model', 'voice', 'rate'] as const) {
      if (patch[field] === undefined) continue;
      if (field === 'model' && !validateModel(patch.model!)) throw new Error('Invalid model');
      if (field === 'voice' && !validateVoice(patch.voice!)) throw new Error('Invalid voice');
      if (field === 'rate' && !validateRate(patch.rate!)) throw new Error('Invalid rate');
      nextSettings[field] = patch[field]!;
    }

    const hasSecretPatch = SECRET_FIELDS.some(([field]) => {
      const value = patch[field];
      return value !== undefined && value !== '';
    });
    for (const [field] of SECRET_FIELDS) {
      const value = patch[field];
      if (value !== undefined && (typeof value !== 'string' || (value !== '' && (value.length < 8 || /\s|PEGA_AQUI/i.test(value))))) {
        throw new Error('Invalid key format (min 8 chars, no spaces)');
      }
    }

    if (hasSecretPatch) {
      if (secretsStore.isLocked()) {
        throw new Error('Store is locked. Call unlock(password) before saving secrets.');
      }
      if (!(await secretsStore.isEncryptionAvailable())) {
        throw new Error('Encryption not available');
      }
    }

    await saveSettings(nextSettings);

    for (const [field, provider] of SECRET_FIELDS) {
      const value = patch[field];
      if (value === undefined || value === '') continue;
      await secretsStore.set(`${provider}Key`, value);
    }

    return getSummary();
  }

  async function clearSecret(provider: 'gemini' | 'youtube'): Promise<SettingsSummary> {
    if (provider !== 'gemini' && provider !== 'youtube') {
      throw new Error('Invalid provider');
    }
    await secretsStore.remove(`${provider}Key`);
    if (legacySecretsStore) {
      await legacySecretsStore.remove(`${provider}Key`);
    }
    return getSummary();
  }

  async function setMasterPassword(password: string): Promise<void> {
    await unlock(password);
  }

  async function unlock(password: string): Promise<void> {
    await secretsStore.unlock(password);
    try {
      if (legacySecretsStore) {
        await legacySecretsStore.unlock(password);
      }
    } catch (error) {
      secretsStore.lock();
      throw error;
    }
  }

  function lock(): void {
    secretsStore.lock();
    legacySecretsStore?.lock();
  }

  function isLocked(): boolean {
    return secretsStore.isLocked() || legacySecretsStore?.isLocked() === true;
  }

  return {
    getSummary,
    getSecret,
    save,
    clearSecret,
    setMasterPassword,
    unlock,
    lock,
    isLocked,
    isEncryptionAvailable: () => secretsStore.isEncryptionAvailable(),
    migrateFromElectron: (electronData: unknown) => secretsStore.migrateFromElectron(electronData),
  };
}
