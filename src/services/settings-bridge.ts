/**
 * Web-compatible settings bridge that replaces window.desktop for settings operations.
 * Provides the same interface as Electron IPC handlers:
 * - getSettings() -> { voice, rate }
 * - saveSettings({ voice?, rate? }) -> updated settings summary
 *
 * Uses settings-web-store for plaintext preferences. The PWA has no provider
 * keys, no model selector and no master password: the site's Netlify functions
 * own the AI and video services.
 */

import { createSettingsStoreWebWrapper } from '@services/settings-web-store';

export interface SettingsSummary {
  voice: string;
  rate: number;
}

export interface SettingsPatch {
  voice?: string;
  rate?: number;
}

export interface SettingsBridge {
  getSettings(): Promise<SettingsSummary>;
  saveSettings(patch: SettingsPatch): Promise<SettingsSummary>;
}

// Global instance
let bridgeInstance: SettingsBridge | null = null;

function createBridge(): SettingsBridge {
  const store = createSettingsStoreWebWrapper();

  return {
    getSettings: () => store.getSummary(),
    saveSettings: (patch: SettingsPatch) => store.save(patch),
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