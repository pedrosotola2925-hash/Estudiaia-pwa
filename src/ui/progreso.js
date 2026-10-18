(() => {
  const E = window.Estudia;

  function renderProgress(course) {
    const state = E.store.getState();
    const progress = state.progress[course] || { practiceCount: 0, history: [], subjects: {} };
    const totalEl = document.getElementById('practice-total');
    if (totalEl) totalEl.textContent = String(progress.practiceCount || 0);
    const historyEl = document.getElementById('practice-history');
    if (historyEl) {
      const items = (progress.history || []).slice(-20);
      historyEl.replaceChildren(...items.map(h => {
        const li = E.ui.el('li', '', 'history-item');
        li.dataset.practiceHistory = h.id;
        const date = new Date(h.at);
        const formatted = date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
        li.append(E.ui.el('span', `${formatted} — ${h.subjectName}: ${h.correct}/${h.total}`, 'history-text'));
        return li;
      }));
    }
    const subjectsEl = document.getElementById('practice-subjects');
    if (subjectsEl) {
      subjectsEl.replaceChildren(...Object.entries(progress.subjects || {}).map(([id, score]) => {
        const subject = E.Core.SUBJECTS.find(s => s.id === id);
        const div = E.ui.el('div', '', 'subject-progress');
        div.dataset.practiceSubject = id;
        div.append(E.ui.el('span', `${subject?.emoji || ''} ${subject?.nombre || id}: ${score.correct}/${score.total}`, 'subject-progress-text'));
        return div;
      }));
    }
  }

  E.features.progreso = {
    init() {},

    render() {
      const cont = document.getElementById('progreso-cont');
      const summary = E.ui.el('div', '', 'progress-summary');
      const totalItem = E.ui.el('div', '', 'summary-item');
      totalItem.append(E.ui.el('strong', 'Prácticas totales: '));
      const totalEl = E.ui.el('span', '');
      totalEl.id = 'practice-total';
      totalItem.append(totalEl);
      summary.append(totalItem);
      const subjectsItem = E.ui.el('div', '', 'summary-item');
      subjectsItem.append(E.ui.el('strong', 'Por materia:'));
      const subjectsEl = E.ui.el('div', '');
      subjectsEl.id = 'practice-subjects';
      subjectsItem.append(subjectsEl);
      summary.append(subjectsItem);
      cont.replaceChildren(
        E.ui.el('h2', '📊 Mi progreso'),
        E.ui.el('p', 'Responde prácticas para ver aquí tu progreso 📊', { style: 'text-align:center;color:#64748b;margin-top:20px;' }),
        summary,
        E.ui.el('h3', 'Historial (últimas 20)'),
        (()=>{const ul=E.ui.el('ul','');ul.id='practice-history';return ul;})()
      );
      renderProgress(E.course());
    },

    leave() {}
  };
})();