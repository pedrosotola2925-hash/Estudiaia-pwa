export interface WorkboxLike {
  addEventListener(event: 'waiting' | 'controlling', listener: () => void): void;
  register(): Promise<unknown>;
  messageSkipWaiting(): void;
}

export interface PwaNavigatorLike {
  serviceWorker?: unknown;
  onLine?: boolean;
}

export interface PwaWindowLike {
  addEventListener(event: 'offline' | 'online', listener: () => void): void;
  location: { reload(): void };
}

export interface ServiceWorkerRegistrationOptions {
  navigatorRef: PwaNavigatorLike;
  windowRef: PwaWindowLike;
  createWorkbox(url: string): WorkboxLike;
  onOffline(): void;
  onOnline(): void;
  onUpdateReady(applyUpdate: () => void): void;
}

/**
 * Registers the generated PWA service worker without coupling the lifecycle
 * to the Electron-compatible UI bootstrap.
 */
export async function registerServiceWorker(
  options: ServiceWorkerRegistrationOptions,
): Promise<WorkboxLike | null> {
  const {
    navigatorRef,
    windowRef,
    createWorkbox,
    onOffline,
    onOnline,
    onUpdateReady,
  } = options;

  if (!navigatorRef.serviceWorker) return null;

  const workbox = createWorkbox('/sw.js');
  workbox.addEventListener('waiting', () => {
    onUpdateReady(() => workbox.messageSkipWaiting());
  });
  workbox.addEventListener('controlling', () => {
    windowRef.location.reload();
  });
  windowRef.addEventListener('offline', onOffline);
  windowRef.addEventListener('online', onOnline);

  if (navigatorRef.onLine === false) onOffline();
  else onOnline();

  await workbox.register();
  return workbox;
}
