(() => {
  const E = window.Estudia;
  if (!E.context) return;

  const $ = id => document.getElementById(id);
  const settings = E.context.settings;

  function browserVoices() {
    try {
      return E.context.voice.getVoices();
    } catch {
      return [];
    }
  }

  function refresh() {
    const summary = E.settings;
    $('settings-rate').value = summary.rate;
    $('rate-label').textContent = `${summary.rate} %`;
    $('connection-status').textContent = 'IA del sitio';

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
        try {
          E.settings = await settings.saveSettings({
            voice: $('voice-select').value,
            rate: Number($('settings-rate').value),
          });
          E.ui.message($('settings-status'), 'Preferencias guardadas.', 'success');
          refresh();
        } catch (error) {
          E.ui.message($('settings-status'), error.message, 'error');
        } finally {
          button.disabled = false;
        }
      };
    },
    render() {
      refresh();
    },
  };
})();
