/**
 * Web-compatible settings bridge that replaces window.desktop for settings operations.
 * Provides the same interface as Electron IPC handlers:
 * - getSettings() -> { model, voice, rate, hasGeminiKey, hasYoutubeKey }
 * - saveSettings(patch) -> updated settings summary
 * - clearKey(provider) -> updated settings summary
 * 
 * Uses settings-web.ts for encrypted storage with password-based encryption.
 */

import { createSettingsStoreWebWrapper } from '@services/settings-web-store';

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
  getSecret(provider: 'gemini' | 'youtube'): Promise<string>;
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

function createBridge(): SettingsBridge {
  const store = createSettingsStoreWebWrapper();

  return {
    getSettings: () => store.getSummary(),
    saveSettings: (patch: SettingsPatch) => store.save(patch),
    clearKey: (provider: 'gemini' | 'youtube') => store.clearSecret(provider),
    getSecret: (provider: 'gemini' | 'youtube') => store.getSecret(provider),
    setMasterPassword: (password: string) => store.setMasterPassword(password),
    unlock: (password: string) => store.unlock(password),
    lock: () => store.lock(),
    isLocked: () => store.isLocked(),
    isEncryptionAvailable: () => store.isEncryptionAvailable(),
    migrateFromElectron: (electronData: unknown) => store.migrateFromElectron(electronData),
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