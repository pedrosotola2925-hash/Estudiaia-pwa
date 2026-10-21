import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '@services/sw-registration';

type Listener = () => void;

function setup({ online = true } = {}) {
  const workboxListeners = new Map<string, Listener>();
  const windowListeners = new Map<string, Listener>();
  const workbox = {
    addEventListener: vi.fn((event: string, listener: Listener) => workboxListeners.set(event, listener)),
    register: vi.fn(async () => undefined),
    messageSkipWaiting: vi.fn(),
  };
  const windowRef = {
    addEventListener: vi.fn((event: string, listener: Listener) => windowListeners.set(event, listener)),
    location: { reload: vi.fn() },
  };
  return {
    workbox,
    workboxListeners,
    windowListeners,
    windowRef,
    navigatorRef: { serviceWorker: {}, onLine: online },
  };
}

describe('SW registration', () => {
  it('registers /sw.js and connects update lifecycle handlers', async () => {
    const fixture = setup();
    const showUpdate = vi.fn();

    await registerServiceWorker({
      navigatorRef: fixture.navigatorRef,
      windowRef: fixture.windowRef,
      createWorkbox: vi.fn(() => fixture.workbox),
      onOffline: vi.fn(),
      onOnline: vi.fn(),
      onUpdateReady: showUpdate,
    });

    expect(fixture.workbox.register).toHaveBeenCalledOnce();
    expect(fixture.workbox.addEventListener).toHaveBeenCalledWith('waiting', expect.any(Function));
    expect(fixture.workbox.addEventListener).toHaveBeenCalledWith('controlling', expect.any(Function));

    fixture.workboxListeners.get('waiting')?.();
    expect(showUpdate).toHaveBeenCalledWith(expect.any(Function));
    showUpdate.mock.calls[0][0]();
    expect(fixture.workbox.messageSkipWaiting).toHaveBeenCalledOnce();

    fixture.workboxListeners.get('controlling')?.();
    expect(fixture.windowRef.location.reload).toHaveBeenCalledOnce();
  });

  it('reports the initial offline state and browser connectivity changes', async () => {
    const fixture = setup({ online: false });
    const onOffline = vi.fn();
    const onOnline = vi.fn();

    await registerServiceWorker({
      navigatorRef: fixture.navigatorRef,
      windowRef: fixture.windowRef,
      createWorkbox: () => fixture.workbox,
      onOffline,
      onOnline,
      onUpdateReady: vi.fn(),
    });

    expect(onOffline).toHaveBeenCalledOnce();
    expect(onOnline).not.toHaveBeenCalled();
    fixture.windowListeners.get('online')?.();
    expect(onOnline).toHaveBeenCalledOnce();
    fixture.windowListeners.get('offline')?.();
    expect(onOffline).toHaveBeenCalledTimes(2);
  });

  it('shows and hides an accessible offline banner', async () => {
    const { createOfflineBanner } = await import('@ui/offline-banner.js');
    const nodes = new Map<string, { hidden: boolean; textContent: string; id: string; className: string; style: Record<string, string>; setAttribute: ReturnType<typeof vi.fn> }>();
    const documentRef = {
      getElementById: (id: string) => nodes.get(id) ?? null,
      createElement: () => ({
        hidden: true,
        textContent: '',
        id: '',
        className: '',
        style: {},
        setAttribute: vi.fn(),
      }),
      body: { append: (node: { id: string; hidden: boolean; textContent: string; className: string; style: Record<string, string>; setAttribute: ReturnType<typeof vi.fn> }) => nodes.set(node.id, node) },
    };

    const banner = createOfflineBanner(documentRef);
    banner.show();
    expect(nodes.get('offline-banner')).toMatchObject({
      hidden: false,
      textContent: 'Sin conexión. Los cambios se guardarán localmente y se sincronizarán al volver.',
    });
    banner.hide();
    expect(nodes.get('offline-banner')?.hidden).toBe(true);
  });
});
