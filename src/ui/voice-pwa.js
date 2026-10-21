(() => {
  const E = window.Estudia;
  if (!E.context) return;

  const $ = id => document.getElementById(id);
  let lastText = '';
  let playing = false;
  let paused = false;

  function clean(text) {
    return String(text)
      .replace(/\[\[PREGUNTA\]\][\s\S]*?\[\[FIN_PREGUNTA\]\]/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, ' ')
      .replace(/#{1,4}|\*\*|\$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function updateStatus(text, state = 'idle') {
    $('voice-status').textContent = text;
    $('voice-play').disabled = !lastText;
    $('voice-pause').disabled = state !== 'playing';
    $('voice-resume').disabled = state !== 'paused';
    $('voice-stop').disabled = state === 'idle';
  }

  function language() {
    const selected = E.settings?.voice || '';
    return selected.startsWith('es-CL') ? 'es-CL' : selected.startsWith('es-MX') ? 'es-MX' : 'es';
  }

  function rate() {
    return Math.max(0.5, Math.min(1.5, 1 + Number(E.settings?.rate || 0) / 100));
  }

  E.voice = {
    init() {
      $('voice-preview').onclick = () => this.play('Hola. Esta es la voz seleccionada para leer tus explicaciones.');
      $('voice-play').onclick = () => this.play();
      $('voice-pause').onclick = () => this.pause();
      $('voice-resume').onclick = () => this.resume();
      $('voice-stop').onclick = () => this.stop();
      updateStatus('');
    },
    setText(text) {
      lastText = clean(text);
      updateStatus(lastText ? 'Listo para leer.' : '');
    },
    play(text) {
      if (text !== undefined) this.setText(text);
      if (!lastText) return;
      try {
        E.context.voice.stop();
        playing = true;
        paused = false;
        updateStatus('Leyendo…', 'playing');
        void E.context.voice.speak(lastText, { lang: language(), rate: rate() }).then(() => {
          if (playing) {
            playing = false;
            paused = false;
            updateStatus('Lectura terminada.');
          }
        }).catch(error => {
          if (playing) {
            playing = false;
            paused = false;
            updateStatus(error.message || 'No se pudo reproducir la voz.', 'idle');
          }
        });
      } catch (error) {
        playing = false;
        paused = false;
        updateStatus(error.message || 'La voz del navegador no está disponible.');
      }
    },
    pause() {
      try {
        E.context.voice.pause();
        if (playing) {
          paused = true;
          updateStatus('Lectura en pausa.', 'paused');
        }
      } catch (error) {
        updateStatus(error.message || 'No se pudo pausar la lectura.');
      }
    },
    resume() {
      try {
        E.context.voice.resume();
        if (playing) {
          paused = false;
          updateStatus('Leyendo…', 'playing');
        }
      } catch (error) {
        updateStatus(error.message || 'No se pudo reanudar la lectura.');
      }
    },
    stop() {
      playing = false;
      paused = false;
      try {
        E.context.voice.stop();
      } catch {
        // The browser can reject stop() before speech synthesis is available.
      }
      updateStatus(lastText ? 'Lectura detenida.' : '');
    },
  };
})();
