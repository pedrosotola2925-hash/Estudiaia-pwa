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
  isLocked(): boolean;
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

function createProviderApi(settingsBridge: SettingsBridge): {
  generate: (request: { kind?: string; course?: string; question?: string; context?: string; file?: unknown }) => Promise<{ text: string }>;
  searchVideos: (request: { query: string }) => Promise<Array<{ id: string; title: string; thumbnail: string }>>;
} {
  // Importación dinámica para evitar ciclo si settings-bridge importa desktop-bridge
  const providerPromise = import('@services/providers-web').then(
    (mod) => mod.createProviderServiceWeb({
      settingsStore: {
        get: (key: string) => {
          if (key === 'geminiKey' || key === 'youtubeKey') {
            return settingsBridge.getSecret(key === 'geminiKey' ? 'gemini' : 'youtube');
          }
          return Promise.resolve(null);
        },
      },
    }),
  );

  return {
    generate: async (request) => {
      const providers = await providerPromise;
      if (settingsBridge.isLocked()) {
        throw new Error('STORE_LOCKED');
      }
      const prompt = request.question ?? '';
      const text = await providers.askGemini(prompt, request.kind === 'lesson' ? undefined : undefined);
      return { text };
    },
    searchVideos: async (request) => {
      const providers = await providerPromise;
      if (settingsBridge.isLocked()) {
        throw new Error('STORE_LOCKED');
      }
      return providers.searchYouTube(request.query, 10);
    },
  };
}

function createWebDesktopApi(settingsBridge: SettingsBridge | null): DesktopApi {
  const providerApi = settingsBridge ? createProviderApi(settingsBridge) : null;

  return {
    getSettings: settingsBridge
      ? () => settingsBridge.getSettings()
      : unavailableSettingsOperation,
    saveSettings: settingsBridge
      ? (patch: SettingsPatch) => settingsBridge.saveSettings(patch)
      : unavailableSettingsOperation,
    clearKey: settingsBridge
      ? (provider: 'gemini' | 'youtube') => settingsBridge.clearKey(provider)
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
