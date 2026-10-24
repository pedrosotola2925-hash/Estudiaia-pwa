import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppContext } from '@services/app-context';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('app-context', () => {
  it('creates context with all services', () => {
    const ctx = createAppContext();

    expect(ctx.settings).toBeDefined();
    expect(ctx.voice).toBeDefined();
    expect(ctx.providers).toBeDefined();
    expect(ctx.router).toBeDefined();
    expect(ctx.store).toBeDefined();
  });

  it('builds providers without a settings store or model resolver', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse({ text: 'Respuesta del proxy.' }));
    vi.stubGlobal('fetch', fetchMock);

    const ctx = createAppContext();
    const request = { id: 'tutor-1', kind: 'tutor' as const, course: '7º básico', question: '¿Qué es una fracción?' };
    await expect(ctx.providers.generate(request)).resolves.toEqual({ text: 'Respuesta del proxy.' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/.netlify/functions/gemini');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ request });
  });

  it('web desktop bridge forwards the full request without keys or lock checks', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse({ text: 'Respuesta del proxy.' }));
    vi.stubGlobal('fetch', fetchMock);

    const { initializeWebDesktopBridge } = await import('@services/desktop-bridge');
    const settingsBridge = {
      getSettings: async () => ({
        model: 'gemini-3.5-flash-lite',
        voice: 'es-MX-DaliaNeural',
        rate: 100,
        hasGeminiKey: false,
        hasYoutubeKey: false,
      }),
      saveSettings: async () => ({
        model: 'gemini-3.5-flash-lite',
        voice: 'es-MX-DaliaNeural',
        rate: 100,
        hasGeminiKey: false,
        hasYoutubeKey: false,
      }),
      clearKey: async () => ({
        model: 'gemini-3.5-flash-lite',
        voice: 'es-MX-DaliaNeural',
        rate: 100,
        hasGeminiKey: false,
        hasYoutubeKey: false,
      }),
      getSecret: async () => {
        throw new Error('getSecret must not be called');
      },
      isLocked: () => true,
    };
    const target: { desktop?: Record<string, (...args: any[]) => unknown> } = {};
    await initializeWebDesktopBridge(target, async () => ({ getSettingsBridge: () => settingsBridge }));

    const request = { id: 'tutor-2', kind: 'tutor', course: '7º básico', question: '¿Qué es una fracción?' };
    await expect(target.desktop!.generate(request)).resolves.toEqual({ text: 'Respuesta del proxy.' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/.netlify/functions/gemini');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ request });
  });
});
