const BANNER_ID = 'offline-banner';
const OFFLINE_MESSAGE = 'Sin conexión. Los cambios se guardarán localmente y se sincronizarán al volver.';

export function createOfflineBanner(documentRef = document) {
  let banner = documentRef.getElementById(BANNER_ID);

  function ensureBanner() {
    if (banner) return banner;

    banner = documentRef.createElement('aside');
    banner.id = BANNER_ID;
    banner.className = 'offline-banner';
    banner.textContent = OFFLINE_MESSAGE;
    banner.hidden = true;
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    Object.assign(banner.style, {
      position: 'fixed',
      inset: 'auto 1rem 1rem',
      zIndex: '1000',
      padding: '0.75rem 1rem',
      borderRadius: '0.5rem',
      background: '#1e293b',
      color: '#fff',
      boxShadow: '0 8px 24px rgb(15 23 42 / 35%)',
    });
    documentRef.body.append(banner);
    return banner;
  }

  return {
    show() {
      ensureBanner().hidden = false;
    },
    hide() {
      if (banner) banner.hidden = true;
    },
  };
}
