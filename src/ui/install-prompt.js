export function createInstallPrompt({
  windowRef = window,
  button = document.getElementById('install-btn'),
} = {}) {
  let deferredPrompt = null;

  if (!button || !windowRef?.addEventListener) {
    return { dispose() {} };
  }

  const hide = () => {
    button.hidden = true;
  };

  const onBeforeInstallPrompt = event => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  };

  const onInstallClick = async () => {
    if (!deferredPrompt) return;

    const promptEvent = deferredPrompt;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') hide();
    deferredPrompt = null;
  };

  windowRef.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  windowRef.addEventListener('appinstalled', hide);
  button.addEventListener('click', onInstallClick);

  return {
    dispose() {
      windowRef.removeEventListener?.('beforeinstallprompt', onBeforeInstallPrompt);
      windowRef.removeEventListener?.('appinstalled', hide);
      button.removeEventListener?.('click', onInstallClick);
    },
  };
}
