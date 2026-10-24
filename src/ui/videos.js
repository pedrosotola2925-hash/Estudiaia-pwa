(() => {
  const E = window.Estudia;
  const resultsByKey = new Map();
  let state = { course: null, subjectId: '', unit: '', results: [], key: '', lesson: null };
  let unitsToken = 0;
  let viewToken = 0;
  let activeSearchId = null;
  let activeLessonId = null;

  const isVideoId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
  const MAX_TUTOR_VIDEO_QUERY_LENGTH = 1000;

  function tutorVideoQuery(question, courseLevel) {
    const suffix = ` nivel ${courseLevel} Chile explicación`;
    const questionLimit = MAX_TUTOR_VIDEO_QUERY_LENGTH - suffix.length;
    return `${question.trim().slice(0, questionLimit).trimEnd()}${suffix}`;
  }

  function safeThumbnail(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'i.ytimg.com' ? url.href : '';
    } catch {
      return '';
    }
  }

  function getCourseLevel(course) {
    if (course.includes('básico')) return 'educación básica';
    if (course.includes('medio') || course.includes('I ') || course.includes('II ') || course.includes('III ') || course.includes('IV ')) return 'educación media';
    return 'escolar';
  }

  function normalizeVideos(value) {
    if (!Array.isArray(value)) throw E.Core.invalid('La búsqueda de vídeos devolvió un formato no válido.');
    return value.flatMap(video => {
      if (!isVideoId(video?.id) || typeof video.title !== 'string' || !video.title.trim()) return [];
      return [{ id: video.id, title: video.title.slice(0, 1000), thumbnail: safeThumbnail(video.thumbnail) }];
    });
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16);
  }

  function currentKey(course = E.course(), subjectId = state.subjectId, unit = state.unit) {
    return `${course}:${subjectId}:${unit}`;
  }

  function setStatus(text = '', kind = 'info') {
    const target = document.getElementById('video-status');
    if (!text) {
      target.replaceChildren();
      return;
    }
    E.ui.message(target, text, kind);
  }

  function selectSubject() {
    return document.getElementById('sel-materia-v');
  }

  function selectUnit() {
    return document.getElementById('sel-unidad-v');
  }

  function resetForCourse(course) {
    state = { course, subjectId: '', unit: '', results: [], key: '', lesson: null };
    setStatus();
    document.getElementById('zona-videos').replaceChildren(
      E.ui.el('p', 'Selecciona materia y unidad, luego busca vídeos.', 'sub')
    );
  }

  function populateSubjects() {
    const subject = selectSubject();
    subject.replaceChildren(new Option('Selecciona una materia', ''));
    for (const item of E.data.subjects) subject.append(new Option(`${item.emoji} ${item.nombre}`, item.id));
    subject.value = state.subjectId;
  }

  function populateUnits(units = []) {
    const unit = selectUnit();
    unit.replaceChildren(new Option(units.length ? 'Selecciona una unidad' : 'Selecciona primero una materia', ''));
    for (const item of units) unit.append(new Option(item, item));
    unit.value = state.unit;
    unit.disabled = !state.subjectId || units.length === 0;
  }

  function renderResults(results = state.results) {
    const target = document.getElementById('zona-videos');
    if (results.length === 0) {
      target.replaceChildren(E.ui.el('p', 'No encontramos vídeos seguros para esa búsqueda. Prueba otra unidad.', 'sub'));
      return;
    }
    const list = E.ui.el('div', '', 'video-list');
    for (const video of results) {
      const card = E.ui.el('article', '', 'card');
      card.dataset.videoId = video.id;
      if (video.thumbnail) {
        const image = document.createElement('img');
        image.src = video.thumbnail;
        image.alt = `Miniatura de ${video.title}`;
        image.loading = 'lazy';
        card.append(image);
      }
      card.append(E.ui.el('h3', video.title));
      card.append(E.ui.button('Ver vídeo', () => E.features.videos.showPlayer(video)));
      list.append(card);
    }
    target.replaceChildren(list);
  }

  E.features.videos = {
    init() {
      selectSubject().onchange = E.ui.guard(() => this.changeSubject());
      document.getElementById('btn-buscar-videos').onclick = E.ui.guard(() => this.search());
      document.getElementById('btn-leccion').onclick = E.ui.guard(() => this.createLesson());
    },

    async render() {
      const course = E.course();
      if (state.course !== course) resetForCourse(course);
      populateSubjects();
      // Si hay una pregunta del tutor activa y no hay materia seleccionada,
      // buscar automáticamente por la pregunta del tutor.
      if (E.lastTutorQuery && !state.subjectId) {
        await this.searchByTutorQuery();
        return;
      }
      if (!state.subjectId) {
        populateUnits();
        return;
      }
      await this.loadUnits({ preserveUnit: true });
      if (state.lesson) this.renderLesson(state.lesson);
      else if (state.results.length) renderResults();
    },

    async changeSubject() {
      state.subjectId = selectSubject().value;
      state.unit = '';
      state.results = [];
      state.lesson = null;
      if (!state.subjectId) {
        populateUnits();
        document.getElementById('zona-videos').replaceChildren(E.ui.el('p', 'Selecciona materia y unidad, luego busca vídeos.', 'sub'));
        return;
      }
      await this.loadUnits();
    },

    async loadUnits({ preserveUnit = false } = {}) {
      const course = E.course();
      const subjectId = state.subjectId;
      if (!subjectId) {
        populateUnits();
        return;
      }
      const token = ++unitsToken;
      populateUnits();
      selectUnit().disabled = true;
      setStatus('Cargando unidades…');
      try {
        const units = await E.features.materias.getUnits(subjectId, course);
        if (token !== unitsToken || state.course !== course || state.subjectId !== subjectId) return;
        if (!preserveUnit || !units.includes(state.unit)) state.unit = '';
        populateUnits(units);
        setStatus();
      } catch (error) {
        if (token === unitsToken) {
          populateUnits();
          setStatus(error.message || 'No se pudieron cargar las unidades.', 'error');
        }
      }
    },

    selected() {
      const course = E.course();
      const subject = E.Core.assertSubject(selectSubject().value);
      const unit = E.Core.requireText(selectUnit().value, 1000);
      state.course = course;
      state.subjectId = subject.id;
      state.unit = unit;
      return { course, subject, unit };
    },

    async search() {
      const { course, subject, unit } = this.selected();
      const key = currentKey(course, subject.id, unit);
      const tutorQuery = E.lastTutorQuery || '';
      state.lesson = null;
      // Si hay una pregunta del tutor activa, no usar caché: buscar vídeos para esa pregunta.
      if (resultsByKey.has(key) && !tutorQuery) {
        state.key = key;
        state.results = resultsByKey.get(key);
        setStatus('Mostrando resultados guardados.');
        renderResults();
        return;
      }
      if (activeSearchId) E.request.cancel(activeSearchId);
      const requestId = crypto.randomUUID();
      const token = ++viewToken;
      activeSearchId = requestId;
      setStatus('Buscando vídeos seguros…');
      document.getElementById('zona-videos').replaceChildren();
      try {
        // Búsqueda 1: Por materia/unidad (clásico) - con nivel educativo
        const courseLevel = getCourseLevel(course);
        const unitQuery = `${subject.nombre} ${unit} ${courseLevel} Chile`;
        const unitResponse = await E.request.run({
          id: requestId + '-unit',
          query: unitQuery
        }, 'searchVideos');
        if (token !== viewToken || E.course() !== course || state.subjectId !== subject.id || state.unit !== unit) return;
        const unitResults = normalizeVideos(unitResponse);

        // Búsqueda 2: Por pregunta del tutor (si hay pregunta activa)
        let tutorResults = [];
        if (tutorQuery) {
          const tutorQueryRefined = tutorVideoQuery(tutorQuery, courseLevel);
          const tutorResponse = await E.request.run({
            id: requestId + '-tutor',
            query: tutorQueryRefined
          }, 'searchVideos');
          if (token !== viewToken || E.course() !== course || state.subjectId !== subject.id || state.unit !== unit) return;
          tutorResults = normalizeVideos(tutorResponse);
        }

        // Combinar resultados (unidad primero, luego tutor, sin duplicados)
        const seen = new Set();
        const combined = [];
        for (const v of [...unitResults, ...tutorResults]) {
          if (!seen.has(v.id)) {
            seen.add(v.id);
            combined.push(v);
          }
        }

        state.key = key;
        state.results = combined;
        resultsByKey.set(key, combined);

        let statusMsg = '';
        if (unitResults.length) statusMsg += `${unitResults.length} vídeo${unitResults.length === 1 ? '' : 's'} por unidad`;
        if (tutorResults.length) {
          if (statusMsg) statusMsg += '; ';
          statusMsg += `${tutorResults.length} vídeo${tutorResults.length === 1 ? '' : 's'} por tu pregunta`;
        }
        if (!statusMsg) statusMsg = 'No hay resultados para esa búsqueda.';
        setStatus(statusMsg);
        renderResults(combined);
      } catch (error) {
        if (error.code !== 'CANCELLED' && token === viewToken) {
          setStatus(error.message || 'No se pudieron buscar vídeos.', 'error');
          document.getElementById('zona-videos').replaceChildren();
        }
      } finally {
        if (activeSearchId === requestId) activeSearchId = null;
      }
    },

    async searchByTutorQuery() {
      const course = E.course();
      const tutorQuery = E.lastTutorQuery || '';
      if (!tutorQuery) return;

      if (activeSearchId) E.request.cancel(activeSearchId);
      const requestId = crypto.randomUUID();
      const token = ++viewToken;
      activeSearchId = requestId;
      setStatus('Buscando vídeos para tu pregunta…');
      document.getElementById('zona-videos').replaceChildren();

      try {
        // Construir query más precisa: pregunta + nivel educativo + contexto chileno
        const courseLevel = getCourseLevel(course);
        const query = tutorVideoQuery(tutorQuery, courseLevel);
        const response = await E.request.run({
          id: requestId,
          query
        }, 'searchVideos');
        if (token !== viewToken || E.course() !== course) return;
        const results = normalizeVideos(response);
        state.results = results;
        state.key = `tutor:${course}:${tutorQuery}`;
        resultsByKey.set(state.key, results);
        setStatus(results.length ? `${results.length} vídeo${results.length === 1 ? '' : 's'} por tu pregunta` : 'No hay resultados para tu pregunta.');
        renderResults(results);
      } catch (error) {
        if (error.code !== 'CANCELLED' && token === viewToken) {
          setStatus(error.message || 'No se pudieron buscar vídeos.', 'error');
          document.getElementById('zona-videos').replaceChildren();
        }
      } finally {
        if (activeSearchId === requestId) activeSearchId = null;
      }
    },

    showPlayer(video) {
      const target = document.getElementById('zona-videos');
      const title = E.ui.el('h3', video.title);
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?rel=0`;
      frame.title = `Vídeo: ${video.title}`;
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allowFullscreen = true;
      frame.addEventListener('error', () => setStatus('No se pudo insertar este vídeo. Ábrelo en YouTube.', 'error'));
      const external = E.ui.button('Abrir en YouTube', () => {
        if (E.context) {
          window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`, '_blank', 'noopener,noreferrer');
        } else {
          window.desktop.openVideo(video.id);
        }
      }, 'btn secondary');
      const back = E.ui.button('Volver a resultados', () => {
        setStatus();
        renderResults();
      }, 'btn');
      target.replaceChildren(title, frame, external, back);
    },

    async createLesson() {
      const { course, subject, unit } = this.selected();
      const cacheKey = `lesson:${currentKey(course, subject.id, unit)}`;
      const token = ++viewToken;
      state.results = [];
      setStatus('Creando lección interactiva…');
      try {
        let lesson;
        const cached = E.store.getCache(cacheKey);
        if (cached) {
          lesson = E.Core.validateLesson(E.Core.parseJSONBlock(cached));
        } else {
          if (activeLessonId) E.request.cancel(activeLessonId);
          const requestId = crypto.randomUUID();
          activeLessonId = requestId;
          const response = await E.request.run({
            id: requestId,
            kind: 'lesson',
            course,
            subjectId: subject.id,
            unit
          });
          if (token !== viewToken || E.course() !== course || state.subjectId !== subject.id || state.unit !== unit) return;
          lesson = E.Core.validateLesson(E.Core.parseJSONBlock(response?.text));
          E.store.putCache(cacheKey, JSON.stringify(lesson));
          if (activeLessonId === requestId) activeLessonId = null;
        }
        if (token !== viewToken) return;
        state.lesson = { ...lesson, course, subjectId: subject.id, unit, id: `lesson-${hash(cacheKey)}` };
        setStatus('Lección lista.');
        this.renderLesson(state.lesson);
      } catch (error) {
        if (error.code !== 'CANCELLED' && token === viewToken) {
          setStatus(error.message || 'No se pudo crear la lección.', 'error');
          document.getElementById('zona-videos').replaceChildren();
        }
      } finally {
        activeLessonId = null;
      }
    },

    renderLesson(lesson) {
      const target = document.getElementById('zona-videos');
      const root = E.ui.el('section', '', 'lesson');
      root.dataset.lesson = lesson.id;
      root.append(E.ui.el('h3', lesson.titulo));
      for (const [index, slide] of lesson.slides.entries()) {
        const card = E.ui.el('article', '', 'card');
        card.dataset.lessonSlide = String(index + 1);
        card.append(E.ui.el('div', slide.emoji, 'subject-emoji'));
        card.append(E.ui.el('h4', slide.titulo));
        card.append(E.ui.el('p', slide.texto));
        root.append(card);
      }
      const final = E.ui.el('div', '', 'card');
      final.append(E.ui.el('strong', `🧠 ${lesson.final.pregunta}`));
      const answers = E.ui.el('div', '', 'fila');
      for (const letter of ['A', 'B']) {
        const answer = E.ui.button(`${letter}) ${lesson.final[letter.toLowerCase()]}`, () => {
          if (answer.disabled) return;
          answers.querySelectorAll('button').forEach(button => { button.disabled = true; });
          if (letter === lesson.final.correcta) {
            const recorded = E.store.recordCorrect(lesson.course, lesson.id);
            setStatus(recorded ? '¡Correcto! Tu avance quedó guardado.' : 'Correcto: esta respuesta ya estaba registrada.', 'success');
          } else {
            setStatus(`Aún no. La respuesta correcta era ${lesson.final.correcta}.`, 'error');
          }
        }, 'btn option');
        answer.dataset.lessonAnswer = letter;
        answers.append(answer);
      }
      final.append(answers);
      root.append(final);
      target.replaceChildren(root);
    },

    leave() {
      viewToken += 1;
      unitsToken += 1;
      if (activeSearchId) E.request.cancel(activeSearchId);
      if (activeLessonId) E.request.cancel(activeLessonId);
      activeSearchId = null;
      activeLessonId = null;
    }
  };
})();
