import { getSettingsBridge } from '@services/settings-bridge';
import { createVoiceServiceWeb } from '@services/voice-web';
import { createProviderServiceWeb } from '@services/providers-web';

export interface SettingsSummary {
  model: string;
  voice: string;
  rate: number;
  hasGeminiKey: boolean;
  hasYoutubeKey: boolean;
}

export interface SettingsService {
  getSettings(): Promise<SettingsSummary>;
  saveSettings(patch: Record<string, unknown>): Promise<SettingsSummary>;
  clearKey(provider: 'gemini' | 'youtube'): Promise<SettingsSummary>;
  getSecret(provider: 'gemini' | 'youtube'): Promise<string>;
  setMasterPassword(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  isLocked(): boolean;
  isEncryptionAvailable(): Promise<boolean>;
}

export interface AppContext {
  settings: SettingsService;
  voice: ReturnType<typeof createVoiceServiceWeb>;
  providers: ReturnType<typeof createProviderServiceWeb>;
  router: Record<string, unknown>;
  store: Record<string, unknown>;
}

type AppContextOptions = Partial<Pick<AppContext, 'settings' | 'voice' | 'providers' | 'router' | 'store'>>;

type LegacyRoot = typeof globalThis & {
  Estudia?: { router?: Record<string, unknown> };
  EstudiaStore?: { createStore(storage: Storage): Record<string, unknown> };
};

let singleton: AppContext | null = null;

function unavailableStore(): Record<string, unknown> {
  return Object.freeze({
    unavailable: true,
  });
}

function resolveStore(root: LegacyRoot): Record<string, unknown> {
  if (root.EstudiaStore?.createStore && typeof root.localStorage !== 'undefined') {
    return root.EstudiaStore.createStore(root.localStorage);
  }
  return unavailableStore();
}

function resolveRouter(root: LegacyRoot): Record<string, unknown> {
  return root.Estudia?.router ?? Object.create(null) as Record<string, unknown>;
}

/**
 * Wires the browser-only services used by the PWA. It deliberately has no
 * Electron imports: Electron keeps its preload IPC bridge in the desktop entry.
 */
export function createAppContext(options: AppContextOptions = {}): AppContext {
  const root = globalThis as LegacyRoot;
  const settings = options.settings ?? getSettingsBridge();
  const voice = options.voice ?? createVoiceServiceWeb();
  const providers = options.providers ?? createProviderServiceWeb({
    settingsStore: {
      get: (key: string) => {
        if (key === 'geminiKey') return settings.getSecret('gemini');
        if (key === 'youtubeKey') return settings.getSecret('youtube');
        return Promise.resolve(null);
      },
    },
    modelResolver: async () => (await settings.getSettings()).model,
  });

  return {
    settings,
    voice,
    providers,
    router: options.router ?? resolveRouter(root),
    store: options.store ?? resolveStore(root),
  };
}

export function getAppContext(): AppContext {
  if (!singleton) singleton = createAppContext();
  return singleton;
}

/** Binds legacy UI globals after their side-effect modules have loaded. */
export function bindAppContextUi(
  context: AppContext,
  bindings: Pick<AppContext, 'router' | 'store'>,
): void {
  context.router = bindings.router;
  context.store = bindings.store;
}

export function resetAppContextForTests(): void {
  singleton = null;
}
