import '@shared/core.js';
import '@shared/store.js';
import { bindAppContextUi, getAppContext } from '@services/app-context';

type PwaWindow = Window & typeof globalThis & {
  Estudia?: { router?: Record<string, unknown> };
  EstudiaContext?: ReturnType<typeof getAppContext>;
  EstudiaPwaLoading?: boolean;
};

const root = window as PwaWindow;

async function startPwa(): Promise<void> {
  root.EstudiaPwaLoading = true;
  const context = getAppContext();
  root.EstudiaContext = context;

  // These legacy renderer files still expose their UI through window.Estudia.
  // Importing them from one module lets Vite bundle every PWA dependency while
  // preserving the tested Electron renderer as a separate classic-script entry.
  await import('@ui/bootstrap.js');
  await import('@ui/dom.js');
  await import('@ui/data.js');
  await import('@ui/router.js');
  await import('@ui/voice-player.js');
  await import('@ui/voice-pwa.js');
  await import('@ui/settings.js');
  await import('@ui/settings-pwa.js');
  await import('@ui/tutor.js');
  await import('@ui/materias.js');
  await import('@ui/practicas.js');
  await import('@ui/progreso.js');
  await import('@ui/videos.js');
  await import('@shared/pomodoro.js');
  await import('@ui/estudiar.js');
  const { createInstallPrompt } = await import('@ui/install-prompt.js');
  createInstallPrompt();

  bindAppContextUi(context, {
    router: root.Estudia?.router ?? Object.create(null),
    store: context.store,
  });
  root.EstudiaPwaLoading = false;
  root.dispatchEvent(new Event('estudia:pwa-ready'));
}

void startPwa().catch(() => {
  root.EstudiaPwaLoading = false;
  const target = document.getElementById('app-message');
  if (target) target.textContent = 'No se pudo cargar la interfaz web. Recarga la página e inténtalo de nuevo.';
});
