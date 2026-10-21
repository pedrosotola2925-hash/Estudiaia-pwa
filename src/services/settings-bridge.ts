/**
 * Web-compatible settings bridge that replaces window.desktop for settings operations.
 * Provides the same interface as Electron IPC handlers:
 * - getSettings() -> { model, voice, rate, hasGeminiKey, hasYoutubeKey }
 * - saveSettings(patch) -> updated settings summary
 * - clearKey(provider) -> updated settings summary
 * 
 * Uses settings-web.ts for encrypted storage with password-based encryption.
 */

import { createSettingsStoreWeb, SettingsStoreWeb } from '@services/settings-web';

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

interface SettingsBridge {
  getSettings(): Promise<SettingsSummary>;
  saveSettings(patch: SettingsPatch): Promise<SettingsSummary>;
  clearKey(provider: 'gemini' | 'youtube'): Promise<SettingsSummary>;
  // Password management
  setMasterPassword(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  isLocked(): boolean;
  isEncryptionAvailable(): Promise<boolean>;
  // Migration
  migrateFromElectron(electronData: unknown): Promise<{ success: boolean; reason?: string }>;
}

// Global instance
let bridgeInstance: SettingsBridge | null = null;

function validateVoice(voice: string): boolean {
  return VOICES.includes(voice as typeof VOICES[number]) || /^local:[^\x00-\x1f]{1,150}$/.test(voice);
}

function validateModel(model: string): boolean {
  return /^gemini-[a-z0-9.-]{1,90}$/.test(model);
}

function validateRate(rate: number): boolean {
  return Number.isInteger(rate) && rate >= -50 && rate <= 50;
}

function validateKey(value: string): boolean {
  return value.length >= 8 && !/\s|PEGA_AQUI/i.test(value);
}

async function getSettingsDB() {
  const { openDB } = await import('idb');
  interface SettingsDBSchema extends DBSchema {
    settings: {
      key: string;
      value: { model: string; voice: string; rate: number };
    };
  }
  return openDB<SettingsDBSchema>('estudiaia-settings', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });
}

async function loadSettings(): Promise<{ model: string; voice: string; rate: number }> {
  const db = await getSettingsDB();
  const stored = await db.get('settings', 'config');
  if (stored) return stored;
  return { model: 'gemini-3.5-flash-lite', voice: VOICES[0], rate: -5 };
}

async function saveSettingsToDB(settings: { model: string; voice: string; rate: number }): Promise<void> {
  const db = await getSettingsDB();
  await db.put('settings', settings, 'config');
}

function createBridge(): SettingsBridge {
  const secretsStore = createSettingsStoreWeb({
    dbName: 'estudiaia-settings',
    storeName: 'secrets',
  });

  let masterPassword: string | null = null;
  let passwordVerified = false;

  async function verifyPassword(password: string): Promise<boolean> {
    // Try to decrypt a test key to verify password
    const keys = await getAllSecretKeys();
    if (keys.length === 0) return true; // No keys yet, any password works for first setup
    for (const key of keys) {
      const result = await secretsStore.get(key, password);
      if (result !== null) return true;
    }
    return false;
  }

  async function getAllSecretKeys(): Promise<string[]> {
    const db = await getSettingsDB();
    // We need to access the secrets store directly
    const { openDB } = await import('idb');
    interface SecretsDBSchema extends DBSchema {
      secrets: { key: string; value: unknown };
    }
    const secretsDB = await openDB<SecretsDBSchema>('estudiaia-settings', 1);
    return secretsDB.getAllKeys('secrets');
  }

  async function getSettings(): Promise<SettingsSummary> {
    const settings = await loadSettings();
    // Check if secrets exist (without decrypting)
    const keys = await getAllSecretKeys();
    const hasGeminiKey = keys.includes('geminiKey');
    const hasYoutubeKey = keys.includes('youtubeKey');
    return {
      model: settings.model,
      voice: settings.voice,
      rate: settings.rate,
      hasGeminiKey,
      hasYoutubeKey,
    };
  }

  async function saveSettings(patch: SettingsPatch): Promise<SettingsSummary> {
    // Validate patch
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Invalid patch');
    }
    const allowedKeys = ['model', 'voice', 'rate', 'geminiKey', 'youtubeKey'];
    if (Object.keys(patch).some(k => !allowedKeys.includes(k))) {
      throw new Error('Invalid patch key');
    }

    const settings = await loadSettings();
    let nextSettings = { ...settings };

    // Update unencrypted settings
    for (const k of ['model', 'voice', 'rate'] as const) {
      if (patch[k] !== undefined) {
        if (k === 'model' && !validateModel(patch.model!)) throw new Error('Modelo no válido');
        if (k === 'voice' && !validateVoice(patch.voice!)) throw new Error('Voz no válida');
        if (k === 'rate' && !validateRate(patch.rate!)) throw new Error('Velocidad no válida');
        nextSettings[k] = patch[k]!;
      }
    }

    await saveSettingsToDB(nextSettings);

    // Handle encrypted secrets
    if (!(await secretsStore.isEncryptionAvailable())) {
      throw new Error('Cifrado no disponible en este contexto');
    }

    // Ensure store is unlocked for secret operations
    if (secretsStore.isLocked()) {
      throw new Error('Debe desbloquear el almacenamiento primero');
    }

    for (const [field, provider] of [['geminiKey', 'gemini'], ['youtubeKey', 'youtube']] as const) {
      if (patch[field] !== undefined) {
        const value = patch[field]!;
        if (value === '') {
          // Clear the key
          await secretsStore.remove(provider + 'Key', masterPassword!);
        } else {
          if (!validateKey(value)) {
            throw new Error('Clave no válida (mín. 8 caracteres, sin espacios)');
          }
          await secretsStore.set(provider + 'Key', value, masterPassword!);
        }
      }
    }

    return getSettings();
  }

  async function clearKey(provider: 'gemini' | 'youtube'): Promise<SettingsSummary> {
    if (!['gemini', 'youtube'].includes(provider)) {
      throw new Error('Proveedor no válido');
    }
    if (secretsStore.isLocked()) {
      throw new Error('Debe desbloquear el almacenamiento primero');
    }
    await secretsStore.remove(provider + 'Key', masterPassword!);
    return getSettings();
  }

  async function setMasterPassword(password: string): Promise<void> {
    if (password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    // Check against common passwords
    const commonPasswords = new Set([
      '12345678', 'password', 'qwerty123', '123456789', '1234567890',
      'admin123', 'welcome1', 'password1', 'qwertyui', 'letmein1'
    ]);
    if (commonPasswords.has(password.toLowerCase())) {
      throw new Error('Contraseña demasiado común, elija una más segura');
    }
    masterPassword = password;
    passwordVerified = true;
    // Verify we can use this password (will create first entry)
    await secretsStore.set('_passwordVerify', 'ok', password);
    await secretsStore.remove('_passwordVerify', password);
  }

  async function unlock(password: string): Promise<void> {
    const verified = await verifyPassword(password);
    if (!verified) {
      throw new Error('Contraseña incorrecta');
    }
    masterPassword = password;
    passwordVerified = true;
    await secretsStore.unlock(password);
  }

  function lock(): void {
    masterPassword = null;
    passwordVerified = false;
    secretsStore.lock();
  }

  function isLocked(): boolean {
    return secretsStore.isLocked();
  }

  async function isEncryptionAvailable(): Promise<boolean> {
    return secretsStore.isEncryptionAvailable();
  }

  async function migrateFromElectron(electronData: unknown): Promise<{ success: boolean; reason?: string }> {
    return secretsStore.migrateFromElectron(electronData);
  }

  return {
    getSettings,
    saveSettings,
    clearKey,
    setMasterPassword,
    unlock,
    lock,
    isLocked,
    isEncryptionAvailable,
    migrateFromElectron,
  };
}

export function getSettingsBridge(): SettingsBridge {
  if (!bridgeInstance) {
    bridgeInstance = createBridge();
  }
  return bridgeInstance;
}

export function resetSettingsBridge(): void {
  bridgeInstance = null;
}