(() => {
  const E = window.Estudia;
  if (!E.context) return;

  const $ = id => document.getElementById(id);
  const settings = E.context.settings;
  const providers = E.context.providers;

  function ensureSecurityRoot() {
    let root = $('settings-security');
    if (root) return root;
    root = document.createElement('section');
    root.id = 'settings-security';
    root.className = 'message info';
    $('settings-form').before(root);
    return root;
  }

  function renderSecurityControls() {
    const root = ensureSecurityRoot();
    root.replaceChildren();

    if (!settings.isLocked()) {
      root.append(E.ui.el('span', '🔒 Almacenamiento de claves desbloqueado durante esta sesión.', 'sub'));
      const lock = E.ui.button('Bloquear ahora', () => {
        settings.lock();
        refresh();
        E.ui.message($('settings-status'), 'Las claves quedaron bloqueadas.', 'success');
      }, 'btn secondary');
      lock.type = 'button';
      root.append(lock);
      return;
    }

    const label = E.ui.el('label', 'Contraseña maestra');
    const input = document.createElement('input');
    input.id = 'settings-master-password';
    input.type = 'password';
    input.autocomplete = 'current-password';
    input.minLength = 12;
    input.placeholder = 'Crea o introduce una contraseña de 12 caracteres';
    label.append(input);

    const unlock = E.ui.button('Desbloquear claves', async () => {
      unlock.disabled = true;
      try {
        await settings.unlock(input.value);
        input.value = '';
        E.settings = await settings.getSettings();
        refresh();
        E.ui.message($('settings-status'), 'Claves desbloqueadas para esta sesión.', 'success');
      } catch (error) {
        E.ui.message($('settings-status'), error.message || 'No se pudo desbloquear las claves.', 'error');
      } finally {
        unlock.disabled = false;
      }
    }, 'btn');
    unlock.type = 'button';

    root.append(
      E.ui.el('p', 'Tus claves se cifran en este navegador. Si es tu primer uso, esta contraseña se convertirá en tu contraseña maestra.', 'sub'),
      label,
      unlock,
    );
  }

  function browserVoices() {
    try {
      return E.context.voice.getVoices();
    } catch {
      return [];
    }
  }

  function refresh() {
    const summary = E.settings;
    $('settings-model').value = summary.model;
    $('settings-rate').value = summary.rate;
    $('rate-label').textContent = `${summary.rate} %`;
    $('gemini-configured').textContent = summary.hasGeminiKey ? 'Gemini: clave guardada.' : 'Gemini: sin clave.';
    $('youtube-configured').textContent = summary.hasYoutubeKey ? 'YouTube: clave guardada.' : 'YouTube: sin clave.';
    $('connection-status').textContent = summary.hasGeminiKey ? 'IA configurada' : 'Configura la IA en Ajustes';

    const voices = [
      new Option('Voz del navegador · español', 'es-MX-DaliaNeural'),
      new Option('Voz chilena del navegador', 'es-CL-CatalinaNeural'),
    ];
    for (const voice of browserVoices()) {
      if (voice.lang.toLowerCase().startsWith('es')) {
        voices.push(new Option(`${voice.name} · ${voice.lang} · local`, `local:${voice.name}`));
      }
    }
    if (!voices.some(option => option.value === summary.voice)) {
      voices.push(new Option('Voz guardada no disponible', summary.voice));
    }
    $('voice-select').replaceChildren(...voices);
    $('voice-select').value = summary.voice;

    const locked = settings.isLocked();
    for (const id of ['check-gemini', 'clear-gemini', 'check-youtube', 'clear-youtube']) {
      $(id).disabled = locked;
    }
    renderSecurityControls();
  }

  E.features.ajustes = {
    init() {
      refresh();
      try {
        E.context.voice.onVoiceChange(refresh);
      } catch {
        // Speech synthesis may be unavailable until the browser exposes voices.
      }

      $('voice-select').onchange = E.ui.guard(async () => {
        E.voice.stop();
        try {
          E.settings = await settings.saveSettings({ voice: $('voice-select').value });
        } finally {
          refresh();
        }
      });
      $('settings-rate').oninput = () => {
        $('rate-label').textContent = `${$('settings-rate').value} %`;
      };
      $('settings-form').onsubmit = async event => {
        event.preventDefault();
        const button = $('settings-save');
        button.disabled = true;
        const patch = {
          model: $('settings-model').value.trim(),
          rate: Number($('settings-rate').value),
          geminiKey: $('settings-gemini-key').value.trim(),
          youtubeKey: $('settings-youtube-key').value.trim(),
        };
        try {
          E.settings = await settings.saveSettings(patch);
          E.ui.message($('settings-status'), 'Guardado. Las claves quedan protegidas en este equipo.', 'success');
          refresh();
        } catch (error) {
          E.ui.message($('settings-status'), error.message, 'error');
        } finally {
          $('settings-gemini-key').value = '';
          $('settings-youtube-key').value = '';
          patch.geminiKey = '';
          patch.youtubeKey = '';
          button.disabled = false;
        }
      };

      for (const provider of ['gemini', 'youtube']) {
        $(`check-${provider}`).onclick = async () => {
          const button = $(`check-${provider}`);
          button.disabled = true;
          E.ui.message($('settings-status'), 'Comprobando conexión…');
          try {
            const result = await providers.checkConnection(provider);
            E.ui.message($('settings-status'), result.message, 'success');
          } catch (error) {
            E.ui.message($('settings-status'), error.message, 'error');
          } finally {
            button.disabled = false;
          }
        };
        $(`clear-${provider}`).onclick = E.ui.guard(async () => {
          if (!confirm(`¿Borrar la clave guardada de ${provider}?`)) return;
          E.settings = await settings.clearKey(provider);
          refresh();
        });
      }
    },
    render() {
      refresh();
    },
  };
})();
