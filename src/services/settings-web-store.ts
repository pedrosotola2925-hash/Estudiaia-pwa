import { createSettingsStoreWeb, SettingsStoreWeb } from './settings-web.ts';

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

interface SettingsStoreWebWrapper {
  getSummary(): SettingsSummary;
  getSecret(provider: 'gemini' | 'youtube'): string;
  save(patch: SettingsPatch): Promise<SettingsSummary>;
  clearSecret(provider: 'gemini' | 'youtube'): Promise<SettingsSummary>;
}

/**
 * Higher-level settings store that mimics the Electron createSettingsStore interface.
 * Uses IndexedDB for unencrypted settings and settings-web for encrypted secrets.
 */
export function createSettingsStoreWebWrapper(options: {
  dbName?: string;
  storeName?: string;
  settingsStoreName?: string;
} = {}): SettingsStoreWebWrapper {
  const dbName = options.dbName ?? 'estudiaia-settings';
  const settingsStoreName = options.settingsStoreName ?? 'settings';
  const secretsStoreName = options.storeName ?? 'secrets';

  // Low-level encrypted secrets store
  const secretsStore = createSettingsStoreWeb({
    dbName,
    storeName: secretsStoreName,
  });

  // Unencrypted settings stored in a separate IndexedDB store
  let settingsCache: {
    model: string;
    voice: string;
    rate: number;
  } | null = null;

  async function getSettingsDB() {
    const { openDB } = await import('idb');
    interface SettingsDBSchema extends DBSchema {
      settings: {
        key: string;
        value: { model: string; voice: string; rate: number };
      };
    }
    return openDB<SettingsDBSchema>(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(settingsStoreName)) {
          db.createObjectStore(settingsStoreName);
        }
      },
    });
  }

  async function loadSettings(): Promise<{ model: string; voice: string; rate: number }> {
    if (settingsCache) return settingsCache;
    const db = await getSettingsDB();
    const stored = await db.get(settingsStoreName, 'config');
    if (stored) {
      settingsCache = stored;
      return stored;
    }
    // Defaults
    const defaults = {
      model: 'gemini-3.5-flash-lite',
      voice: VOICES[0],
      rate: -5,
    };
    settingsCache = defaults;
    return defaults;
  }

  async function saveSettings(settings: { model: string; voice: string; rate: number }): Promise<void> {
    const db = await getSettingsDB();
    await db.put(settingsStoreName, settings, 'config');
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

  async function getSummary(): Promise<SettingsSummary> {
    const settings = await loadSettings();
    const [hasGeminiKey, hasYoutubeKey] = await Promise.all([
      secretsStore.get('geminiKey', '').then(v => v !== null && v !== ''),
      secretsStore.get('youtubeKey', '').then(v => v !== null && v !== ''),
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
    // This would need the password - in practice, the UI would unlock first
    // For now, return empty string (the Electron version decrypts with safeStorage)
    return '';
  }

  async function save(patch: SettingsPatch): Promise<SettingsSummary> {
    // Validate patch keys
    const allowedKeys = ['model', 'voice', 'rate', 'geminiKey', 'youtubeKey'];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
        Object.keys(patch).some(k => !allowedKeys.includes(k))) {
      throw new Error('Invalid patch');
    }

    const settings = await loadSettings();
    let nextSettings = { ...settings };

    // Update unencrypted settings
    for (const k of ['model', 'voice', 'rate'] as const) {
      if (patch[k] !== undefined) {
        if (k === 'model' && !validateModel(patch.model!)) throw new Error('Invalid model');
        if (k === 'voice' && !validateVoice(patch.voice!)) throw new Error('Invalid voice');
        if (k === 'rate' && !validateRate(patch.rate!)) throw new Error('Invalid rate');
        nextSettings[k] = patch[k]!;
      }
    }

    await saveSettings(nextSettings);

    // Update encrypted secrets (requires password - in practice, the store must be unlocked)
    // Note: This is a simplified version. The actual implementation would need the password.
    // The UI should call unlock() first, then save secrets.
    for (const [field, provider] of [['geminiKey', 'gemini'], ['youtubeKey', 'youtube']] as const) {
      if (patch[field] !== undefined && patch[field] !== '') {
        const value = patch[field]!;
        if (value.length < 8 || /\s|PEGA_AQUI/i.test(value)) {
          throw new Error('Invalid key format');
        }
        if (!(await secretsStore.isEncryptionAvailable())) {
          throw new Error('Encryption not available');
        }
        // The store must be unlocked with a password before saving secrets
        // This will be handled by the UI flow
      }
    }

    return getSummary();
  }

  async function clearSecret(provider: 'gemini' | 'youtube'): Promise<SettingsSummary> {
    if (!['gemini', 'youtube'].includes(provider)) {
      throw new Error('Invalid provider');
    }
    const key = provider === 'gemini' ? 'geminiKey' : 'youtubeKey';
    await secretsStore.remove(key, ''); // Would need password
    return getSummary();
  }

  // Expose the low-level store for lock/unlock operations
  return {
    getSummary,
    getSecret,
    save,
    clearSecret,
    // Expose low-level store methods for password management
    _secretsStore: secretsStore,
  } as SettingsStoreWebWrapper & { _secretsStore: SettingsStoreWeb };
}