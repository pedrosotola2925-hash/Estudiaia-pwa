(() => {
  'use strict';

  const E = window.Estudia = { features: {}, ready: false };
  E.context = window.EstudiaContext || null;
  const pending = new Map();

  E.request = {
    async run(raw, operation = 'generate') {
      const req = { ...raw, id: raw.id || crypto.randomUUID() };
      const state = { cancelled: false };
      pending.set(req.id, state);
      try {
        const result = E.context
          ? operation === 'searchVideos'
            ? await E.context.providers.searchVideos(req)
            : await E.context.providers.generate(req)
          : operation === 'searchVideos'
            ? await window.desktop.searchVideos(req)
            : await window.desktop.generate(req);
        if (state.cancelled) throw Object.assign(new Error('Cancelado'), { code: 'CANCELLED' });
        return result;
      } finally {
        pending.delete(req.id);
      }
    },
    cancel(id) {
      const state = pending.get(id);
      if (state) state.cancelled = true;
      if (E.context) {
        E.context.providers.cancel(id);
        return Promise.resolve();
      }
      return window.desktop.cancel(id).catch(() => {});
    },
    cancelAll() {
      for (const [id, state] of pending) {
        state.cancelled = true;
        if (E.context) E.context.providers.cancel(id);
        else window.desktop.cancel(id).catch(() => {});
      }
    },
  };

  E.course = () => E.store.getState().course;
  E.cachePut = (key, text) => {
    try {
      E.store.putCache(key, text);
    } catch (error) {
      E.ui.toast(error.message, 'error');
    }
  };

  async function initDesktopBridge() {
    if (E.context || window.desktop) return;
    const { initializeWebDesktopBridge } = await import('@services/desktop-bridge');
    await initializeWebDesktopBridge(window);
  }

  const desktopBridgePromise = initDesktopBridge();

  async function initPwaServiceWorker() {
    if (!E.context || typeof navigator === 'undefined' || !navigator.serviceWorker) return;

    const [{ registerServiceWorker }, { createOfflineBanner }, { Workbox }] = await Promise.all([
      import('@services/sw-registration'),
      import('@ui/offline-banner.js'),
      import('workbox-window'),
    ]);
    const banner = createOfflineBanner(document);
    await registerServiceWorker({
      navigatorRef: navigator,
      windowRef: window,
      createWorkbox: url => new Workbox(url),
      onOffline: () => banner.show(),
      onOnline: () => banner.hide(),
      onUpdateReady: applyUpdate => {
        const message = E.ui.message(
          document.getElementById('app-message'),
          'Nueva versión disponible.',
          'info',
        );
        message.append(document.createTextNode(' '), E.ui.button('Actualizar', applyUpdate));
      },
    });
  }

  async function init() {
    await desktopBridgePromise;
    try {
      E.store = E.context?.store || EstudiaStore.createStore(localStorage);
      const settings = E.context?.settings || window.desktop;
      E.settings = await settings.getSettings();
      const sel = document.getElementById('sel-curso');
      sel.replaceChildren(...E.data.courses.map(course => new Option(course, course)));
      sel.value = E.course();
      sel.onchange = () => {
        try {
          E.store.setCourse(sel.value);
          E.request.cancelAll();
          E.voice.stop();
          E.lastTutorQuery = null;
          for (const feature of Object.values(E.features)) feature.leave?.();
          E.router.go(E.router.current);
        } catch (error) {
          sel.value = E.course();
          E.ui.toast(error.message, 'error');
        }
      };
      E.router.init();
      E.voice.init();
      E.features.ajustes.init();
      document.getElementById('card-prueba').onclick = () => E.router.go('practicas');
      document.getElementById('card-estudiar').onclick = () => E.router.go('aprender');
      for (const [name, feature] of Object.entries(E.features)) {
        if (name !== 'ajustes') feature.init?.();
      }
      E.router.go('inicio');
      if (E.store.warning) E.ui.toast(E.store.warning, 'error');
      E.ready = true;
      void initPwaServiceWorker().catch(() => {});
    } catch {
      document.getElementById('app-message').textContent = 'No se pudo iniciar la interfaz. Cierra y vuelve a abrir la aplicación.';
    }
  }

  if (window.EstudiaPwaLoading) {
    window.addEventListener('estudia:pwa-ready', init, { once: true });
  } else if (document.readyState === 'complete') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
