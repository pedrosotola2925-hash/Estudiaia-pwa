import type { SettingsSummary } from '@services/settings-bridge';
import type { GeneratedRequest, VideoResult } from '@services/providers-web';

export type { SettingsSummary };

export interface SettingsBridge {
  getSettings(): Promise<SettingsSummary>;
  saveSettings(patch: { voice?: string; rate?: number }): Promise<SettingsSummary>;
}

type DesktopApi = Record<string, (...args: any[]) => unknown>;
type DesktopTarget = { desktop?: DesktopApi };
type SettingsBridgeLoader = () => Promise<{ getSettingsBridge: () => SettingsBridge }>;

export const SETTINGS_BRIDGE_UNAVAILABLE_MESSAGE = 'Settings bridge unavailable';

function unavailableSettingsOperation(): Promise<never> {
  return Promise.reject(new Error(SETTINGS_BRIDGE_UNAVAILABLE_MESSAGE));
}

function notImplemented(method: string) {
  return async () => ({
    ok: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `${method} not implemented yet`,
    },
  });
}

function createProviderApi(): {
  generate: (request: GeneratedRequest) => Promise<{ text: string }>;
  searchVideos: (request: { id: string; query: string }) => Promise<VideoResult[]>;
} {
  // Importación dinámica para evitar ciclo si settings-bridge importa desktop-bridge.
  // El proxy no consulta secretos ni bloqueo: reenvía la solicitud completa.
  const providerPromise = import('@services/providers-web').then(
    (mod) => mod.createProviderServiceWeb(),
  );

  return {
    generate: async (request) => (await providerPromise).generate(request),
    searchVideos: async (request) => (await providerPromise).searchVideos(request),
  };
}

function createWebDesktopApi(settingsBridge: SettingsBridge | null): DesktopApi {
  const providerApi = settingsBridge ? createProviderApi() : null;

  return {
    getSettings: settingsBridge
      ? () => settingsBridge.getSettings()
      : unavailableSettingsOperation,
    saveSettings: settingsBridge
      ? (patch: { voice?: string; rate?: number }) => settingsBridge.saveSettings(patch)
      : unavailableSettingsOperation,
    searchVideos: providerApi
      ? providerApi.searchVideos
      : notImplemented('searchVideos'),
    generate: providerApi
      ? providerApi.generate
      : notImplemented('generate'),
    speak: notImplemented('speak'),
    cancel: notImplemented('cancel'),
    openVideo: notImplemented('openVideo'),
    checkConnection: notImplemented('checkConnection'),
  };
}

/**
 * Installs the PWA bridge only when Electron did not preload window.desktop.
 * Settings-import failures deliberately expose rejecting operations rather than
 * successful-looking default settings.
 */
export async function initializeWebDesktopBridge(
  target: DesktopTarget,
  loadSettingsBridge: SettingsBridgeLoader = () => import('@services/settings-bridge'),
): Promise<void> {
  if (target.desktop) return;

  try {
    const { getSettingsBridge } = await loadSettingsBridge();
    target.desktop = createWebDesktopApi(getSettingsBridge());
  } catch {
    target.desktop = createWebDesktopApi(null);
  }
}
