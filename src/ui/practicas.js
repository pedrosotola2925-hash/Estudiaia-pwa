(() => {
  const E = window.Estudia;
  let activePractice = null;
  let generating = false;

  function createQuestionEl(question, index, onAnswer) {
    const { p, o, c, e } = question;
    const container = E.ui.el('article', '', 'quiz-question');
    const header = E.ui.el('div', '', 'quiz-header');
    const indexEl = E.ui.el('span', String(index + 1), 'quiz-index');
    indexEl.dataset.practiceIndex = String(index + 1);
    header.append(indexEl);
    header.append(E.ui.el('span', `Pregunta ${index + 1} de 5`, 'quiz-index-label'));
    container.append(header);
    container.append(E.ui.el('h3', p));
    const options = E.ui.el('div', '', 'quiz-options');
    o.forEach((option, optIndex) => {
      const btn = E.ui.button(option, () => {
        if (container.dataset.answered === 'true') return;
        if (activePractice && activePractice.current !== index) return;
        container.dataset.answered = 'true';
        options.querySelectorAll('button').forEach(b => b.disabled = true);
        if (optIndex === c) btn.classList.add('correct');
        else btn.classList.add('wrong');
        const explanation = E.ui.el('p', e, 'quiz-explanation');
        container.append(explanation);
        onAnswer(optIndex === c);
      }, 'btn option');
      btn.dataset.practiceOption = String(optIndex);
      options.append(btn);
    });
    container.append(options);
    return container;
  }

  E.features.practicas = {
    init() {
      const selMateria = document.getElementById('sel-materia');
      const selUnidad = document.getElementById('sel-unidad');
      const btnCrear = document.getElementById('btn-crear-practica');

      selMateria.replaceChildren(new Option('', ''), ...E.Core.SUBJECTS.map(s => new Option(s.nombre, s.id)));
      selMateria.addEventListener('change', async () => {
        selUnidad.replaceChildren(new Option('', ''));
        const subjectId = selMateria.value;
        if (!subjectId) return;
        try {
          const units = await E.features.materias.getUnits(subjectId, E.course());
          selUnidad.replaceChildren(...units.map(u => new Option(u, u)));
        } catch (e) {
          E.ui.toast(e.message, 'error');
        }
      });

      btnCrear.onclick = () => {
        if (generating) return;
        generating = true;
        btnCrear.disabled = true;
        btnCrear.textContent = 'Generando…';
        const status = document.getElementById('practice-status');
        status.replaceChildren();
        (async () => {
          try {
            const subjectId = selMateria.value;
            const unit = selUnidad.value;
            if (!subjectId || !unit) {
              generating = false;
              btnCrear.disabled = false;
              btnCrear.textContent = 'Crear práctica (5 preguntas)';
              E.ui.message(status, 'Selecciona una materia y una unidad.', 'error');
              return;
            }
            const subject = E.Core.assertSubject(subjectId);
            const payload = {
              id: crypto.randomUUID(),
              kind: 'practice',
              course: E.course(),
              subjectId: subject.id,
              unit
            };
            const result = await E.request.run(payload);
            if (!result || typeof result.text !== 'string' || !result.text.trim()) {
              throw E.Core.invalid('El servicio devolvió una respuesta vacía.');
            }
            const questions = E.Core.validatePractice(JSON.parse(result.text));
            activePractice = { questions, current: 0, correct: 0, incorrect: [], subjectId: subject.id, subjectName: subject.nombre, unit };
            this.renderQuestion(0);
          } catch (e) {
            E.ui.message(status, e.message || 'No se pudo crear la práctica.', 'error');
          } finally {
            generating = false;
            btnCrear.disabled = false;
            btnCrear.textContent = 'Crear práctica (5 preguntas)';
          }
        })();
      };
    },

    renderQuestion(index) {
      const zona = document.getElementById('zona-quiz');
      if (!activePractice || index < 0 || index >= activePractice.questions.length) return;
      const question = activePractice.questions[index];
      const container = createQuestionEl(question, index, async (isCorrect) => {
        if (isCorrect) activePractice.correct += 1;
        else activePractice.incorrect.push({ index, question });
        activePractice.current += 1;
        // Pequeña pausa para que la explicación de la respuesta sea legible
        // antes de avanzar a la siguiente pregunta.
        await new Promise(resolve => setTimeout(resolve, 100));
        if (activePractice.current < activePractice.questions.length) {
          this.renderQuestion(activePractice.current);
        } else {
          await this.finishPractice();
        }
      });
      zona.replaceChildren(container);
    },

    async finishPractice() {
      const { correct, subjectId, subjectName, unit } = activePractice;
      const course = E.course();
      const attemptId = crypto.randomUUID();
      const attempt = {
        id: attemptId,
        course,
        subjectId,
        subjectName,
        correct,
        total: 5,
        at: new Date().toISOString()
      };
      const status = document.getElementById('practice-status');
      let saved;
      try {
        saved = E.store.recordPractice(attempt);
      } catch (e) {
        E.ui.message(status, 'Error al guardar: ' + (e.message || String(e)), 'error');
        activePractice = null;
        return;
      }
      if (!saved) {
        E.ui.message(status, 'Esta práctica ya fue registrada.', 'error');
      } else {
        E.ui.message(status, `Práctica guardada: ${correct} de 5 correctas.`, 'success');
      }
      if (activePractice.incorrect.length > 0) {
        const review = E.ui.el('section', '', 'practice-review');
        review.dataset.practiceReview = 'true';
        review.append(E.ui.el('h3', 'Preguntas para repasar'));
        const list = E.ui.el('ol');
        for (const { index, question } of activePractice.incorrect) {
          const item = E.ui.el('li');
          item.append(E.ui.el('p', `Pregunta ${index + 1} de 5: ${question.p}`));
          item.append(E.ui.el('p', `Respuesta correcta: ${question.o[question.c]}`));
          list.append(item);
        }
        review.append(list);
        status.append(review);
      }
      activePractice = null;
      const zona = document.getElementById('zona-quiz');
      zona.replaceChildren(E.ui.el('p', 'Selecciona una materia y unidad, luego pulsa “Crear práctica”.', { style: 'color:#64748b;' }));
    },

    leave() {
      activePractice = null;
      generating = false;
      document.getElementById('zona-quiz').replaceChildren(E.ui.el('p', 'Selecciona una materia y unidad, luego pulsa "Crear práctica".', { style: 'color:#64748b;' }));
    },
    render() {
      const selMateria = document.getElementById('sel-materia');
      const selUnidad = document.getElementById('sel-unidad');
      selMateria.replaceChildren(new Option('', ''), ...E.Core.SUBJECTS.map(s => new Option(s.nombre, s.id)));
      selUnidad.replaceChildren(new Option('', ''));
    },
    async open({ subjectId }) {
      const selMateria = document.getElementById('sel-materia');
      const selUnidad = document.getElementById('sel-unidad');
      selMateria.value = subjectId;
      selUnidad.replaceChildren(new Option('', ''));
      const units = await E.features.materias.getUnits(subjectId, E.course());
      selUnidad.replaceChildren(...units.map(u => new Option(u, u)));
    }
  };
})();