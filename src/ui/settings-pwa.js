(() => {
  const E = window.Estudia;
  if (!E.context) return;

  const $ = id => document.getElementById(id);
  const settings = E.context.settings;

  function refresh() {
    const summary = E.settings;
    $('settings-rate').value = summary.rate;
    $('rate-label').textContent = `${summary.rate} %`;
    $('connection-status').textContent = 'IA del sitio';

    const mexicanVoice = 'es-MX-DaliaNeural';
    $('voice-select').replaceChildren(
      new Option('Español de México preferido · respaldo en español', mexicanVoice)
    );
    $('voice-select').value = mexicanVoice;
  }

  E.features.ajustes = {
    init() {
      refresh();
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
