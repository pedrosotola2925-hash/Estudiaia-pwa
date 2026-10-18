(() => {
  const E = window.Estudia;
  if (!E.Pomodoro) E.Pomodoro = window.EstudiaPomodoro;
  let pomodoro = null;
  let pomodoroInterval = null;

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updatePomodoroDisplay() {
    const state = pomodoro ? pomodoro.getState() : { phase: 'study', remainingSeconds: 1500, running: false, completedStudies: 0 };
    const el = document.getElementById('pomodoro-display');
    if (el) el.textContent = formatTime(state.remainingSeconds);
    const btn = document.getElementById('btn-pomodoro-start');
    if (btn) btn.textContent = state.running ? 'Pausar' : 'Iniciar';
  }

  function startPomodoroTick() {
    if (pomodoroInterval) return;
    pomodoroInterval = setInterval(() => {
      pomodoro.tick();
      updatePomodoroDisplay();
    }, 1000);
  }

  function stopPomodoroTick() {
    if (pomodoroInterval) {
      clearInterval(pomodoroInterval);
      pomodoroInterval = null;
    }
  }

  E.features.estudiar = {
    init() {
      if (!pomodoro && E.Pomodoro) {
        pomodoro = E.Pomodoro.createPomodoro({
          now: () => Date.now(),
          onComplete: (phase) => {
            const phaseEl = document.getElementById('pomodoro-phase');
            if (phaseEl) phaseEl.textContent = phase === 'study' ? 'Estudio' : phase === 'shortBreak' ? 'Descanso corto' : 'Descanso largo';
            E.ui.toast(`Fase terminada: ${phase}`, 'info');
          },
        });
      }
    },

    render() {
      const cont = document.getElementById('estudiar-root');
      const state = pomodoro ? pomodoro.getState() : { phase: 'study', remainingSeconds: 1500, running: false, completedStudies: 0 };

      const pomodoroCard = E.ui.el('div', '', 'pomodoro-card');
      pomodoroCard.append(E.ui.el('h3', '🍅 Pomodoro'));
      const display = E.ui.el('div', formatTime(state.remainingSeconds), '');
      display.id = 'pomodoro-display';
      pomodoroCard.append(display);
      const phaseEl = E.ui.el('div', state.phase === 'study' ? 'Estudio' : state.phase === 'shortBreak' ? 'Descanso corto' : 'Descanso largo', '');
      phaseEl.id = 'pomodoro-phase';
      pomodoroCard.append(phaseEl);
      const btnStart = E.ui.el('button', state.running ? 'Pausar' : 'Iniciar');
      btnStart.id = 'btn-pomodoro-start';
      pomodoroCard.append(btnStart);
      const btnReset = E.ui.el('button', 'Reiniciar');
      btnReset.id = 'btn-pomodoro-reset';
      pomodoroCard.append(btnReset);

      const noteCard = E.ui.el('div', '', 'note-card');
      noteCard.append(E.ui.el('h3', '📝 Mis notas'));
      const textarea = E.ui.el('textarea', '');
      textarea.id = 'note-text';
      // Show the last saved note when the view reopens.
      const savedNotes = E.store.getState().notes || [];
      if (savedNotes.length > 0) textarea.value = savedNotes[savedNotes.length - 1].text;
      noteCard.append(textarea);
      const btnSave = E.ui.el('button', 'Guardar nota');
      btnSave.id = 'btn-save-note';
      noteCard.append(btnSave);
      const noteStatus = E.ui.el('div', '', '');
      noteStatus.id = 'note-status';
      noteCard.append(noteStatus);

      const planCard = E.ui.el('div', '', 'plan-card');
      planCard.append(E.ui.el('h3', '🎯 Plan de estudio'));
      const dateInput = E.ui.el('input', '');
      dateInput.id = 'plan-date';
      dateInput.type = 'date';
      planCard.append(dateInput);
      const btnPlan = E.ui.el('button', 'Generar plan');
      btnPlan.id = 'btn-generar-plan';
      planCard.append(btnPlan);
      const planStatus = E.ui.el('div', '', '');
      planStatus.id = 'plan-status';
      planCard.append(planStatus);

      // Wire up listeners on the freshly rendered controls (elements are already
      // created above; they are attached to the DOM by replaceChildren below).
      btnStart.onclick = () => {
        const state = pomodoro.getState();
        if (state.running) pomodoro.pause();
        else pomodoro.start();
        startPomodoroTick();
        updatePomodoroDisplay();
      };
      btnReset.onclick = () => {
        pomodoro.reset();
        updatePomodoroDisplay();
      };
      btnSave.onclick = () => {
        const textarea = document.getElementById('note-text');
        const status = document.getElementById('note-status');
        const text = (textarea && textarea.value) || '';
        if (!text.trim()) {
          const msg = E.ui.el('div', 'La nota no puede estar vacía.', 'message error');
          msg.setAttribute('role', 'alert');
          status.replaceChildren(msg);
          return;
        }
        try {
          E.store.saveNote({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            technique: 'estudiar',
            text: text.trim(),
          });
          const msg = E.ui.el('div', 'Nota guardada.', 'message success');
          msg.setAttribute('role', 'status');
          status.replaceChildren(msg);
        } catch (e) {
          const msg = E.ui.el('div', 'Error al guardar: ' + (e.message || String(e)), 'message error');
          msg.setAttribute('role', 'alert');
          status.replaceChildren(msg);
        }
      };
      btnPlan.onclick = async () => {
        const dateInput = document.getElementById('plan-date');
        const status = document.getElementById('plan-status');
        const today = new Date().toISOString().slice(0, 10);
        const selected = dateInput.value || today;
        if (selected < today) {
          const msg = E.ui.el('div', 'La fecha no puede ser pasada.', 'message error');
          msg.setAttribute('role', 'alert');
          status.replaceChildren(msg);
          return;
        }
        status.replaceChildren(E.ui.el('div', 'Generando plan…', 'message info'));
        try {
          const result = await E.request.run({
            id: crypto.randomUUID(),
            kind: 'plan',
            course: E.course(),
            today,
            context: { today, examDate: selected },
          });
          const plan = E.Core.validateLesson(E.Core.parseJSONBlock(result.text));
          const msg = E.ui.el('div', 'Plan generado: ' + plan.titulo, 'message success');
          msg.setAttribute('role', 'status');
          status.replaceChildren(msg);
        } catch (e) {
          const msg = E.ui.el('div', 'Error al generar plan: ' + (e.message || String(e)), 'message error');
          msg.setAttribute('role', 'alert');
          status.replaceChildren(msg);
        }
      };

      const studyTools = E.ui.el('div', '', 'study-tools');
      studyTools.append(pomodoroCard);
      studyTools.append(noteCard);
      studyTools.append(planCard);

      cont.replaceChildren(
        E.ui.el('h2', '📚 Aprender a estudiar'),
        studyTools,
        E.ui.el('h3', 'Técnicas de estudio'),
        E.ui.el('p', 'Técnicas disponibles próximamente.', { style: 'color:#64748b;margin-top:12px;' })
      );
      updatePomodoroDisplay();
    },

    leave() {
      stopPomodoroTick();
      if (pomodoro) {
        pomodoro.pause();
        pomodoro.reset();
      }
    },
  };
  E.features.aprender = E.features.estudiar;
})();