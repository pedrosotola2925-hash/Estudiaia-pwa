import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const VOICES = ['es-MX-DaliaNeural', 'es-CL-CatalinaNeural'] as const;

export interface SettingsSummary {
  voice: string;
  rate: number;
}

export interface SettingsPatch {
  voice?: string;
  rate?: number;
}

export interface SettingsStoreWebWrapper {
  getSummary(): Promise<SettingsSummary>;
  save(patch: SettingsPatch): Promise<SettingsSummary>;
}

interface PlainSettings {
  voice: string;
  rate: number;
}

interface PlainSettingsDBSchema extends DBSchema {
  settings: {
    key: string;
    value: PlainSettings;
  };
  [storeName: string]: {
    key: string;
    value: PlainSettings;
  };
}

const DEFAULT_SETTINGS: PlainSettings = {
  voice: VOICES[0],
  rate: -5,
};

/**
 * PWA preferences store. It persists and returns only the voice and the reading
 * rate: there is no secret, model, unlock or migration operation, and it never
 * opens, probes, migrates, deletes or decrypts the former `secrets` database.
 *
 * Voice and rate can still be read from the existing plaintext preferences
 * database; any legacy shape is normalized in memory without rewriting the
 * stored record or touching ciphertext.
 */
export function createSettingsStoreWebWrapper(options: {
  dbName?: string;
  settingsDbName?: string;
  settingsStoreName?: string;
} = {}): SettingsStoreWebWrapper {
  const dbName = options.dbName ?? 'estudiaia-settings';
  // Plaintext preferences live at `<dbName>-settings`; reads fall back to
  // cccbdb2's `<dbName>/settings` layout without modifying it.
  const settingsDbName = options.settingsDbName ?? `${dbName}-settings`;
  const settingsStoreName = options.settingsStoreName ?? 'settings';
  const legacySettingsDbName = options.settingsDbName === undefined && settingsDbName !== dbName
    ? dbName
    : null;

  let settingsCache: PlainSettings | null = null;
  let settingsDatabase: IDBPDatabase<PlainSettingsDBSchema> | null = null;
  let settingsDatabasePromise: Promise<IDBPDatabase<PlainSettingsDBSchema>> | null = null;

  function normalizeVoice(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    return VOICES.includes(value as typeof VOICES[number]) || /^local:[^\x00-\x1f]{1,150}$/.test(value)
      ? value
      : null;
  }

  function normalizeRate(value: unknown): number | null {
    return Number.isInteger(value) && (value as number) >= -50 && (value as number) <= 50
      ? (value as number)
      : null;
  }

  function normalizeSettings(value: unknown): PlainSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ...DEFAULT_SETTINGS };
    }
    const stored = value as { voice?: unknown; rate?: unknown };
    return {
      voice: normalizeVoice(stored.voice) ?? DEFAULT_SETTINGS.voice,
      rate: normalizeRate(stored.rate) ?? DEFAULT_SETTINGS.rate,
    };
  }

  async function loadSettings(): Promise<PlainSettings> {
    if (settingsCache) return settingsCache;
    const database = await getSettingsDB();
    const stored = await database.get(settingsStoreName, 'config');
    if (stored) {
      settingsCache = normalizeSettings(stored);
      return settingsCache;
    }
    const legacySettings = await loadLegacySettings();
    if (legacySettings) {
      settingsCache = normalizeSettings(legacySettings);
      return settingsCache;
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
    return normalizeVoice(voice) !== null;
  }

  function validateRate(rate: number): boolean {
    return normalizeRate(rate) !== null;
  }

  async function getSummary(): Promise<SettingsSummary> {
    const settings = await loadSettings();
    return { voice: settings.voice, rate: settings.rate };
  }

  async function save(patch: SettingsPatch): Promise<SettingsSummary> {
    const allowedKeys = ['voice', 'rate'];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      Object.keys(patch).some(key => !allowedKeys.includes(key))) {
      throw new Error('Invalid patch');
    }

    const settings = await loadSettings();
    const nextSettings: PlainSettings = { ...settings };
    for (const field of allowedKeys) {
      if (patch[field] === undefined) continue;
      if (field === 'voice' && !validateVoice(patch.voice!)) throw new Error('Invalid voice');
      if (field === 'rate' && !validateRate(patch.rate!)) throw new Error('Invalid rate');
      nextSettings[field] = patch[field]!;
    }

    await saveSettings(nextSettings);
    return getSummary();
  }

  return {
    getSummary,
    save,
  };
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
}
