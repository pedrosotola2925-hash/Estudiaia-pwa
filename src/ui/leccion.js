(() => {
  const E = window.Estudia;

  function cleanMarkdownForSpeech(text) {
    return String(text)
      .replace(/\[\[PREGUNTA\]\][\s\S]*?\[\[FIN_PREGUNTA\]\]/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, ' ')
      .replace(/#{1,4}|\*\*|\$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function backToSubjects() {
    delete E.currentLessonTopic;
    E.router.go('materias');
  }

  E.features.leccion = {
    init() {},

    async render() {
      const cont = document.getElementById('leccion-cont');
      cont.replaceChildren();

      const course = E.course();
      const topicState = E.currentLessonTopic;
      if (!topicState?.subjectId || !topicState?.unit) {
        cont.append(
          E.ui.el('p', 'No se ha seleccionado un tema. Regresa a Materias y elige una unidad.', 'message info'),
          E.ui.button('← Volver a materias', backToSubjects, 'btn secondary')
        );
        return;
      }

      const { subjectId, unit } = topicState;
      const subject = E.data.subjects.find(item => item.id === subjectId);
      if (!subject) {
        cont.append(
          E.ui.el('p', 'Materia no válida.', 'message error'),
          E.ui.button('← Volver a materias', backToSubjects, 'btn secondary')
        );
        return;
      }

      cont.appendChild(E.ui.el('p', 'Generando lección interactiva…', 'message info'));

      try {
        const prompt = `Genera una lección educativa detallada sobre el tema "${unit}" de la materia "${subject.nombre}" para el curso "${course}" en Chile. La lección debe incluir:\n1. Una introducción atractiva que motive al estudiante.\n2. Una explicación clara de qué se trata el tema y por qué es importante.\n3. Contenido rico con definiciones clave, conceptos fundamentales y ejemplos ilustrativos.\n4. Ejercicios de enseñanza paso a paso que guíen al estudiante en cómo resolver problemas relacionados.\n5. Preguntas de práctica para que el estudiante aplique lo aprendido, con retroalimentación sugerida.\n\nFormato de respuesta: Usa Markdown con encabezados claros (##, ###) para cada sección. Incluye ejemplos en bloques de código si son relevantes. Sé específico, educativo y adecuado para el nivel del curso.`;
        const result = await E.request.run({ question: prompt, course, kind: 'tutor' });
        const lessonText = result?.text?.trim();

        if (!lessonText) {
          throw new Error('El servicio devolvió una respuesta vacía.');
        }

        cont.replaceChildren();

        const header = E.ui.el('div', '', 'lesson-header');
        header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        header.appendChild(E.ui.el('h2', `${subject.emoji} ${subject.nombre} - ${unit}`));

        const speak = E.ui.button('🔊 Escuchar', () => {
          const speechText = cleanMarkdownForSpeech(lessonText);
          if (!speechText) {
            E.ui.toast('No hay texto disponible para leer.', 'error');
            return;
          }
          E.voice.setText(speechText);
          E.voice.play(speechText);
        }, 'btn speaker');
        speak.style.cssText = 'margin-left:8px;';

        const stop = E.ui.button('Detener', () => E.voice.stop(), 'btn secondary');
        stop.style.cssText = 'margin-left:8px;';

        header.append(speak, stop);
        cont.append(header);

        const lesson = E.ui.el('div', '', 'leccion-content');
        lesson.appendChild(E.ui.renderMarkdown(lessonText));
        cont.append(
          lesson,
          E.ui.button('← Volver a materias', backToSubjects, 'btn secondary')
        );
      } catch (error) {
        if (error.code === 'CANCELLED') return;
        cont.replaceChildren(
          E.ui.el('p', `No se pudo generar la lección: ${error.message}`, 'message error'),
          E.ui.button('← Volver a materias', backToSubjects, 'btn secondary')
        );
      }
    },

    leave() {
      delete E.currentLessonTopic;
    }
  };
})();